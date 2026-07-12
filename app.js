let siteData = {
  recipes: [],
  pantry: [],
  meal_log: []
};

const activeFilters = {
  tags: new Set(),
  ingredients: new Set()
};

const views = {
  recipes: document.querySelector("#recipesView"),
  pantry: document.querySelector("#pantryView"),
  planner: document.querySelector("#plannerView")
};

const recipeSections = [
  { label: "Breakfast", id: "breakfast" },
  { label: "Lunch/Dinner", id: "lunch-dinner" },
  { label: "Drinks", id: "drinks" },
  { label: "Desserts", id: "desserts" },
  { label: "Snack/Appetizers", id: "snack-appetizers" }
];

const pantrySections = ["Meats", "Grains", "Produce", "Spread", "Dairy", "Condiments"];

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

document.querySelector("#recipeSearch").addEventListener("input", renderRecipes);
document.querySelector("#categoryFilter").addEventListener("change", renderRecipes);
document.querySelector("#heatmapMonth").addEventListener("change", renderPlanner);

loadSiteData();

async function loadSiteData() {
  try {
    const response = await fetch(`data/site-data.json?v=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    siteData = await response.json();
  } catch (error) {
    console.error(error);
    document.querySelector("#recipeList").append(emptyState("Could not load data/site-data.json."));
    return;
  }

  renderFilterControls();
  render();
}

function render() {
  renderRecipes();
  renderPantry();
  renderRecommendations();
  renderMealControls();
  renderPlanner();
}

function showView(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
}

function renderFilterControls() {
  const categories = ["All", ...recipeSections.map((section) => section.label)];
  document.querySelector("#categoryFilter").innerHTML = categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");

  renderChipGroup("#tagFilters", unique(siteData.recipes.flatMap((recipe) => recipe.tags)).sort(), "tags");
  renderChipGroup("#ingredientFilters", unique(siteData.recipes.flatMap((recipe) => recipe.labels)).sort(), "ingredients");
}

function renderChipGroup(selector, values, filterKey) {
  const container = document.querySelector(selector);
  container.innerHTML = "";

  values.forEach((value) => {
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.type = "button";
    chip.textContent = value;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      toggleFilter(filterKey, value);
      chip.setAttribute("aria-pressed", String(activeFilters[filterKey].has(value)));
      renderRecipes();
    });
    container.append(chip);
  });
}

function toggleFilter(filterKey, value) {
  const filters = activeFilters[filterKey];
  if (filters.has(value)) filters.delete(value);
  else filters.add(value);
}

function renderRecipes() {
  const search = document.querySelector("#recipeSearch").value.trim().toLowerCase();
  const category = document.querySelector("#categoryFilter").value || "All";
  const recipes = siteData.recipes
    .filter((recipe) => {
      const searchable = [
        recipe.title,
        recipe.category,
        recipe.prep_time,
        recipe.ingredients.join(" "),
        recipe.labels.join(" "),
        recipe.tags.join(" "),
        recipe.body
      ].join(" ").toLowerCase();
      const matchesSearch = !search || searchable.includes(search);
      const matchesCategory = category === "All" || getRecipeSection(recipe) === category;
      const matchesTags = [...activeFilters.tags].every((tag) => recipe.tags.includes(tag));
      const matchesIngredients = [...activeFilters.ingredients].every((ingredient) => recipe.labels.includes(ingredient));
      return matchesSearch && matchesCategory && matchesTags && matchesIngredients;
    })
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  document.querySelector("#recipeCount").textContent = `${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`;
  const list = document.querySelector("#recipeList");
  list.innerHTML = "";
  if (!recipes.length) return list.append(emptyState("No recipes match these filters."));
  renderRecipeSections(list, recipes);
}

function renderRecipeSections(container, recipes) {
  recipeSections.forEach((section) => {
    const sectionRecipes = recipes
      .filter((recipe) => getRecipeSection(recipe) === section.label)
      .sort((a, b) => a.title.localeCompare(b.title));

    if (!sectionRecipes.length) return;

    const block = document.createElement("section");
    block.className = "recipe-section";
    block.id = section.id;
    block.innerHTML = `<h3>${escapeHtml(section.label)}</h3>`;

    const sectionList = document.createElement("div");
    sectionList.className = "recipe-name-list";
    sectionRecipes.forEach((recipe) => sectionList.append(recipeCard(recipe)));
    block.append(sectionList);
    container.append(block);
  });
}

function getRecipeSection(recipe) {
  return recipe.section || "Lunch/Dinner";
}

function recipeCard(recipe) {
  const item = document.createElement("details");
  item.className = "recipe-name-item";
  const sourceLink = recipe.source
    ? `<a href="${escapeHtml(recipe.source)}" target="_blank" rel="noopener noreferrer">Source</a>`
    : "<span>No source saved</span>";
  item.innerHTML = `
    <summary>${escapeHtml(recipe.title)}</summary>
    <div class="recipe-preview">
      <span>${escapeHtml([recipe.category, recipe.prep_time, recipe.servings].filter(Boolean).join(" · "))}</span>
      <div class="recipe-preview-links">
        ${sourceLink}
        <a href="${escapeHtml(recipe.page)}" target="_blank" rel="noopener noreferrer">Open recipe</a>
      </div>
    </div>
  `;
  return item;
}

function renderPantry() {
  const list = document.querySelector("#pantryList");
  list.innerHTML = "";
  document.querySelector("#pantryCount").textContent = `${siteData.pantry.length} pantry item${siteData.pantry.length === 1 ? "" : "s"}`;

  if (!siteData.pantry.length) return list.append(emptyState("No pantry rows found."));

  const categories = [
    ...pantrySections,
    ...unique(siteData.pantry.map((item) => item.category).filter((category) => !pantrySections.includes(category)))
  ];

  categories.forEach((category) => {
    const sectionItems = siteData.pantry.filter((item) => item.category === category);
    const section = document.createElement("section");
    section.className = "pantry-section";
    section.innerHTML = `<h3>${escapeHtml(category)}</h3>`;

    sectionItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "pantry-row";
      row.innerHTML = `
        <strong>${escapeHtml(item.item)}</strong>
        <span>${escapeHtml([item.quantity, item.notes].filter(Boolean).join(" · "))}</span>
      `;
      section.append(row);
    });

    list.append(section);
  });
}

function renderRecommendations() {
  const list = document.querySelector("#recommendationsList");
  list.innerHTML = "";
  const recommendations = siteData.recipes
    .map((recipe) => ({
      recipe,
      missing: getMissingIngredients(recipe),
      matchCount: recipe.labels.length - getMissingIngredients(recipe).length
    }))
    .sort((a, b) => a.missing.length - b.missing.length || b.matchCount - a.matchCount || a.recipe.title.localeCompare(b.recipe.title))
    .slice(0, 6);

  if (!recommendations.length) return list.append(emptyState("No recipes available."));

  recommendations.forEach((recommendation) => {
    const row = document.createElement("article");
    row.className = "recommendation-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(recommendation.recipe.title)}</strong>
        <span>${escapeHtml(recommendation.recipe.category)}</span>
        <p>${recommendation.missing.length ? `Need ${escapeHtml(recommendation.missing.join(", "))}` : "All labels are in your pantry."}</p>
      </div>
    `;
    list.append(row);
  });
}

function renderMealControls() {
  const months = getMonthOptions();
  const currentMonth = monthKey(new Date());
  const select = document.querySelector("#heatmapMonth");
  select.innerHTML = months.map((month) => `<option value="${month.value}">${month.label}</option>`).join("");
  select.value = months.some((month) => month.value === currentMonth) ? currentMonth : months[0]?.value;
}

function renderPlanner() {
  renderHeatmap();
  renderMealLog();
}

function renderHeatmap() {
  const target = document.querySelector("#mealHeatmap");
  const selectedMonth = document.querySelector("#heatmapMonth").value || monthKey(new Date());
  const [year, month] = selectedMonth.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  const counts = countMealsByDate();

  target.innerHTML = "";
  for (let day = 1; day <= days; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = counts.get(date) ?? 0;
    const cell = document.createElement("div");
    cell.className = `heat-cell level-${Math.min(count, 4)}`;
    cell.title = `${date}: ${count} meal${count === 1 ? "" : "s"}`;
    cell.textContent = day;
    target.append(cell);
  }
}

function renderMealLog() {
  const selectedMonth = document.querySelector("#heatmapMonth").value || monthKey(new Date());
  const meals = siteData.meal_log
    .filter((meal) => meal.date.startsWith(selectedMonth))
    .sort((a, b) => b.date.localeCompare(a.date));

  document.querySelector("#monthMealCount").textContent = `${meals.length} meal${meals.length === 1 ? "" : "s"}`;
  const list = document.querySelector("#mealLogList");
  list.innerHTML = "";
  if (!meals.length) return list.append(emptyState("No meals logged for this month."));

  meals.forEach((meal) => {
    const recipe = siteData.recipes.find((item) => item.id === meal.recipe);
    const row = document.createElement("article");
    row.className = "list-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(recipe?.title ?? meal.recipe)}</strong>
        <span>${escapeHtml(formatDate(meal.date))}</span>
        ${meal.review ? `<p>${escapeHtml(meal.review)}</p>` : ""}
      </div>
    `;
    list.append(row);
  });
}

function getMissingIngredients(recipe) {
  const pantryItems = new Set(siteData.pantry.map((item) => normalize(item.item)));
  return recipe.labels.filter((label) => !pantryItems.has(normalize(label)));
}

function getMonthOptions() {
  const months = new Set([monthKey(new Date())]);
  siteData.meal_log.forEach((meal) => months.add(meal.date.slice(0, 7)));
  return [...months].sort().reverse().map((value) => {
    const [year, month] = value.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return { value, label: date.toLocaleDateString(undefined, { month: "long", year: "numeric" }) };
  });
}

function countMealsByDate() {
  const counts = new Map();
  siteData.meal_log.forEach((meal) => counts.set(meal.date, (counts.get(meal.date) ?? 0) + 1));
  return counts;
}

function renderMarkdownPreview(markdown) {
  const notes = markdown
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && !line.match(/^\d+\./))
    .slice(0, 2)
    .join(" ");
  return notes ? `<p class="notes">${escapeHtml(notes)}</p>` : "";
}

function chipMarkup(value, kind) {
  return `<button class="inline-chip" type="button" data-filter-kind="${kind}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
}

function syncFilterButtons() {
  document.querySelectorAll(".filter-chip").forEach((chip) => {
    const group = chip.closest("#tagFilters") ? "tags" : "ingredients";
    chip.setAttribute("aria-pressed", String(activeFilters[group].has(chip.textContent)));
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function emptyState(message) {
  const element = document.querySelector("#emptyStateTemplate").content.firstElementChild.cloneNode(true);
  element.querySelector("span").textContent = message;
  return element;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function normalize(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
