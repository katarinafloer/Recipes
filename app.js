let siteData = {
  recipes: [],
  pantry: [],
  meal_log: [],
  restaurants: []
};

// Shopping list — persisted in localStorage
// Each item: { ingredient, recipeTitle, recipeId, checked }
function loadShoppingList() {
  try { return JSON.parse(localStorage.getItem("shoppingList") || "[]"); } catch { return []; }
}
function saveShoppingList(list) {
  localStorage.setItem("shoppingList", JSON.stringify(list));
}
function importShoppingListFromHash() {
  const match = window.location.hash.match(/^#shopping\?list=(.+)$/);
  if (!match) return false;
  try {
    const imported = JSON.parse(atob(decodeURIComponent(match[1])));
    if (!Array.isArray(imported)) return false;
    const existing = loadShoppingList();
    imported.forEach((item) => {
      if (!existing.some((e) => e.ingredient === item.ingredient && e.recipeId === item.recipeId)) {
        existing.push({ ...item, checked: false });
      }
    });
    saveShoppingList(existing);
    history.replaceState(null, "", "#shopping");
    return true;
  } catch { return false; }
}
function addToShoppingList(ingredient, recipeTitle, recipeId) {
  const list = loadShoppingList();
  const exists = list.some((i) => i.ingredient === ingredient && i.recipeId === recipeId);
  if (!exists) {
    list.push({ ingredient, recipeTitle, recipeId, checked: false });
    saveShoppingList(list);
    renderShoppingList();
    showShoppingBadge();
  }
}
function showShoppingBadge() {
  const count = loadShoppingList().filter((i) => !i.checked).length;
  const tab = document.querySelector("[data-view='shopping']");
  if (tab) tab.dataset.badge = count > 0 ? count : "";
}

const activeFilters = {
  tags: new Set(),
  ingredients: new Set()
};

const views = {
  recipes: document.querySelector("#recipesView"),
  pantry: document.querySelector("#pantryView"),
  planner: document.querySelector("#plannerView"),
  restaurants: document.querySelector("#restaurantsView"),
  shopping: document.querySelector("#shoppingView")
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
document.querySelector("#heatmapMonth").addEventListener("change", () => {
  const month = document.querySelector("#heatmapMonth").value;
  history.replaceState(null, "", `#calendar/${month}`);
  renderPlanner();
});

window.addEventListener("popstate", applyHash);

importShoppingListFromHash();
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
  showShoppingBadge();
  document.querySelector("#clearShoppingList").addEventListener("click", () => {
    saveShoppingList([]);
    renderShoppingList();
  });
  document.querySelector("#shareShoppingList").addEventListener("click", () => {
    const list = loadShoppingList();
    if (!list.length) return;
    const encoded = encodeURIComponent(btoa(JSON.stringify(list)));
    const url = `${location.origin}${location.pathname}#shopping?list=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.querySelector("#shareShoppingList");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Share list"; }, 2000);
    });
  });
  applyHash();
}

function applyHash() {
  const hash = window.location.hash;
  const calendarMatch = hash.match(/^#calendar\/(\d{4}-\d{2})$/);
  if (calendarMatch) {
    showView("planner");
    const select = document.querySelector("#heatmapMonth");
    if ([...select.options].some((o) => o.value === calendarMatch[1])) {
      select.value = calendarMatch[1];
      renderPlanner();
    }
    return;
  }
  if (hash === "#pantry") { showView("pantry"); return; }
  if (hash === "#restaurants") { showView("restaurants"); return; }
  if (hash === "#shopping") { showView("shopping"); return; }
  if (hash === "#recipes") { showView("recipes"); return; }
}

function showView(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
  if (name === "planner") {
    const month = document.querySelector("#heatmapMonth").value;
    history.replaceState(null, "", `#calendar/${month}`);
  } else if (name === "pantry") {
    history.replaceState(null, "", "#pantry");
  } else if (name === "shopping") {
    history.replaceState(null, "", "#shopping");
    renderShoppingList();
  } else if (name === "restaurants") {
    history.replaceState(null, "", "#restaurants");
    setTimeout(renderRestaurants, 0);
  } else {
    history.replaceState(null, "", "#recipes");
  }
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
  if (recipe.title.includes("(favorite!)")) item.classList.add("favorite");
  const cooked = recipe.dates_cooked && recipe.dates_cooked.length > 0;
  const displayTitle = recipe.title.replace(/\s*\(favorite!\)\s*/i, "").trim();
  item.innerHTML = `
    <summary>
      <span class="cooked-dot${cooked ? " cooked-dot-yes" : ""}" title="${cooked ? `Cooked ${recipe.dates_cooked.length}x` : "Never cooked"}"></span>${escapeHtml(displayTitle)}
    </summary>
    <div class="recipe-preview">
      <span>${escapeHtml([recipe.category, recipe.prep_time, recipe.servings].filter(Boolean).join(" · "))}</span>
      ${(recipe.ingredients || []).length ? `
        <ul class="ingredient-list">
          ${(recipe.ingredients).map((ing) => `<li><button class="ingredient-btn" data-ingredient="${escapeHtml(ing)}" data-recipe-title="${escapeHtml(displayTitle)}" data-recipe-id="${escapeHtml(recipe.id)}">+ ${escapeHtml(ing)}</button></li>`).join("")}
        </ul>` : ""}
      <div class="recipe-preview-links">
        ${sourceLink}
        <a href="${escapeHtml(recipe.page)}" target="_blank" rel="noopener noreferrer">Open recipe</a>
      </div>
    </div>
  `;
  item.querySelectorAll(".ingredient-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      addToShoppingList(btn.dataset.ingredient, btn.dataset.recipeTitle, btn.dataset.recipeId);
      btn.classList.add("ingredient-added");
      btn.textContent = "✓ " + btn.dataset.ingredient;
    });
  });
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

let restaurantMap = null;

function renderRestaurants() {
  const container = document.querySelector("#restaurantsList");
  container.innerHTML = "";
  const data = siteData.restaurants || [];
  if (!data.length) return container.append(emptyState("No restaurants added yet."));

  // Build map
  const mapEl = document.querySelector("#restaurantsMap");
  const cityPoints = data.filter((g) => g.lat && g.lng);
  if (typeof L !== "undefined" && cityPoints.length) {
    if (restaurantMap) { restaurantMap.remove(); restaurantMap = null; }
    restaurantMap = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18
    }).addTo(restaurantMap);

    const accentIcon = L.divIcon({
      className: "",
      html: `<div style="width:12px;height:12px;background:#b83a0a;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    cityPoints.forEach((g) => {
      const venueLines = (g.venues || []).map((v) => {
        const dishes = (v.dishes || []).map((d) => `<em>${d.name}</em>`).join(", ");
        return `<strong>${v.name}</strong>${dishes ? `: ${dishes}` : ""}`;
      }).join("<br>");
      L.marker([g.lat, g.lng], { icon: accentIcon })
        .addTo(restaurantMap)
        .bindPopup(`<div style="font-family:sans-serif;font-size:13px"><strong style="font-size:14px">${g.city}</strong><br><br>${venueLines}</div>`);
    });

    const bounds = L.latLngBounds(cityPoints.map((g) => [g.lat, g.lng]));
    restaurantMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  } else {
    mapEl.style.display = "none";
  }

  data.forEach((cityGroup) => {
    const citySection = document.createElement("section");
    citySection.className = "restaurant-city";
    citySection.innerHTML = `<h3 class="restaurant-city-heading">${escapeHtml(cityGroup.city)}</h3>`;

    const venueList = document.createElement("ul");
    venueList.className = "venue-list";

    (cityGroup.venues || []).forEach((venue) => {
      const nameHtml = venue.url
        ? `<a href="${escapeHtml(venue.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(venue.name)}</a>`
        : escapeHtml(venue.name);
      const dishes = (venue.dishes || [])
        .filter((d) => d.name && d.name !== "Everything")
        .map((d) => {
          const parts = [d.name, d.description].filter(Boolean).join(": ");
          return `<span class="venue-dish">${escapeHtml(parts)}</span>`;
        }).join("");
      const everythingNote = (venue.dishes || []).find((d) => d.name === "Everything");

      const li = document.createElement("li");
      li.className = "venue-row";
      li.innerHTML = `<span class="venue-name">${nameHtml}</span>${dishes ? `<span class="venue-dishes">${dishes}</span>` : ""}${everythingNote ? `<span class="venue-note">${escapeHtml(everythingNote.description)}</span>` : ""}`;
      venueList.append(li);
    });

    citySection.append(venueList);
    container.append(citySection);
  });
}

function renderShoppingList() {
  const container = document.querySelector("#shoppingList");
  container.innerHTML = "";
  const list = loadShoppingList();
  showShoppingBadge();

  if (!list.length) {
    container.append(emptyState("No items yet. Open a recipe and click ingredients to add them."));
    return;
  }

  // Group by recipe
  const byRecipe = {};
  list.forEach((item, idx) => {
    if (!byRecipe[item.recipeId]) byRecipe[item.recipeId] = { title: item.recipeTitle, items: [] };
    byRecipe[item.recipeId].items.push({ ...item, idx });
  });

  Object.values(byRecipe).forEach((group) => {
    const section = document.createElement("section");
    section.className = "shopping-group";

    const recipe = siteData.recipes.find((r) => r.id === group.items[0].recipeId);
    const titleHtml = recipe?.page
      ? `<a href="${escapeHtml(recipe.page)}" target="_blank" rel="noopener noreferrer">${escapeHtml(group.title)}</a>`
      : escapeHtml(group.title);
    section.innerHTML = `<h3 class="shopping-recipe-title">${titleHtml}</h3>`;

    const ul = document.createElement("ul");
    ul.className = "shopping-items";
    group.items.forEach(({ ingredient, checked, idx }) => {
      const li = document.createElement("li");
      li.className = `shopping-item${checked ? " shopping-item-checked" : ""}`;
      li.innerHTML = `
        <label>
          <input type="checkbox" ${checked ? "checked" : ""} data-idx="${idx}">
          <span>${escapeHtml(ingredient)}</span>
        </label>
        <button class="shopping-remove" data-idx="${idx}" title="Remove">x</button>
      `;
      li.querySelector("input").addEventListener("change", (e) => {
        const l = loadShoppingList();
        l[idx].checked = e.target.checked;
        saveShoppingList(l);
        renderShoppingList();
      });
      li.querySelector(".shopping-remove").addEventListener("click", () => {
        const l = loadShoppingList();
        l.splice(idx, 1);
        saveShoppingList(l);
        renderShoppingList();
      });
      ul.append(li);
    });
    section.append(ul);
    container.append(section);
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
        <strong>${recommendation.recipe.page ? `<a href="${escapeHtml(recommendation.recipe.page)}" target="_blank" rel="noopener noreferrer">${escapeHtml(recommendation.recipe.title)}</a>` : escapeHtml(recommendation.recipe.title)}</strong>
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
  renderCalendar();
}

function renderCalendar() {
  const selectedMonth = document.querySelector("#heatmapMonth").value || monthKey(new Date());
  const [year, month] = selectedMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Group meals by date
  const mealsByDate = new Map();
  siteData.meal_log
    .filter((meal) => meal.date.startsWith(selectedMonth))
    .forEach((meal) => {
      if (!mealsByDate.has(meal.date)) mealsByDate.set(meal.date, []);
      mealsByDate.get(meal.date).push(meal);
    });

  const totalMeals = [...mealsByDate.values()].reduce((sum, arr) => sum + arr.length, 0);
  document.querySelector("#monthMealCount").textContent = `${totalMeals} meal${totalMeals === 1 ? "" : "s"}`;

  const container = document.querySelector("#mealCalendar");
  container.innerHTML = "";

  // Day-of-week headers (Mon first)
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const header = document.createElement("div");
  header.className = "cal-header";
  DOW.forEach((d) => {
    const cell = document.createElement("div");
    cell.className = "cal-dow";
    cell.textContent = d;
    header.append(cell);
  });
  container.append(header);

  const grid = document.createElement("div");
  grid.className = "cal-grid";

  // Offset: Monday = 0
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const offset = (firstDow + 6) % 7; // Mon-based

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day cal-day-empty";
    grid.append(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const meals = mealsByDate.get(date) || [];
    const isToday = date === monthKey(new Date()) + `-${String(new Date().getDate()).padStart(2, "0")}`.slice(-3);

    const cell = document.createElement("div");
    cell.className = `cal-day${meals.length ? " cal-day-has-meal" : ""}${date === `${monthKey(new Date())}-${String(new Date().getDate()).padStart(2, "0")}` ? " cal-day-today" : ""}`;

    const num = document.createElement("span");
    num.className = "cal-day-num";
    num.textContent = day;
    cell.append(num);

    meals.forEach((meal) => {
      const recipe = siteData.recipes.find((r) => r.id === meal.recipe);
      const title = recipe?.title ?? meal.recipe;
      const link = document.createElement("a");
      link.className = "cal-meal";
      link.textContent = title.replace(/\s*\(favorite!\)\s*/i, "");
      if (recipe?.page) { link.href = recipe.page; link.target = "_blank"; link.rel = "noopener noreferrer"; }
      else { link.href = "#"; link.addEventListener("click", (e) => e.preventDefault()); }
      cell.append(link);
    });

    grid.append(cell);
  }

  container.append(grid);
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
