// Firebase setup
firebase.initializeApp({
  apiKey: "AIzaSyCQ8aCJWo6gs3lIK9H6IAXwRYGNB2sXzD0",
  authDomain: "recipes-71f32.firebaseapp.com",
  databaseURL: "https://recipes-71f32-default-rtdb.firebaseio.com",
  projectId: "recipes-71f32",
  storageBucket: "recipes-71f32.firebasestorage.app",
  messagingSenderId: "674007341993",
  appId: "1:674007341993:web:da86b872354645254ec2b8"
});
const fbAuth = firebase.auth();
const fbDb = firebase.database();

let currentUser = null;
let shoppingListRef = null;
let localList = [];

fbAuth.onAuthStateChanged((user) => {
  currentUser = user;
  renderAuthUI();
  if (shoppingListRef) { shoppingListRef.off(); shoppingListRef = null; }
  if (user) {
    shoppingListRef = fbDb.ref(`users/${user.uid}/shoppingList`);
    shoppingListRef.on("value", (snap) => {
      localList = snap.val() || [];
      renderShoppingList();
      showShoppingBadge();
    });
  } else {
    localList = [];
    renderShoppingList();
    showShoppingBadge();
  }
});

function renderAuthUI() {
  const el = document.querySelector("#authUI");
  if (!el) return;
  if (currentUser) {
    el.innerHTML = `<span class="auth-user">${escapeHtml(currentUser.displayName || currentUser.email)}</span><button class="btn-ghost" id="signOutBtn">Sign out</button>`;
    el.querySelector("#signOutBtn").addEventListener("click", () => fbAuth.signOut());
  } else {
    el.innerHTML = `<button class="btn-ghost" id="signInBtn">Sign in with Google</button>`;
    el.querySelector("#signInBtn").addEventListener("click", () => {
      fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    });
  }
}

function loadShoppingList() { return localList; }
function saveShoppingList(list) {
  localList = list;
  if (shoppingListRef) shoppingListRef.set(list.length ? list : null);
}

function addToShoppingList(ingredient, recipeTitle, recipeId) {
  const list = loadShoppingList();
  const exists = list.some((i) => i.ingredient === ingredient && i.recipeId === recipeId);
  if (!exists) {
    list.push({ ingredient, recipeTitle, recipeId, checked: false });
    saveShoppingList(list);
  }
}

function removeFromShoppingList(ingredient, recipeId) {
  const list = loadShoppingList().filter((i) => !(i.ingredient === ingredient && i.recipeId === recipeId));
  saveShoppingList(list);
}
function showShoppingBadge() {
  const count = loadShoppingList().filter((i) => !i.checked).length;
  const tab = document.querySelector("[data-view='shopping']");
  if (tab) tab.dataset.badge = count > 0 ? count : "";
}

let siteData = {
  recipes: [],
  pantry: [],
  meal_log: [],
};

const activeFilters = {
  cooked: new Set(),
  diet: new Set()
};

const dietOptions = [
  { key: "vegetarian", label: "🌿 Vegetarian", test: (r) => (r.tags||[]).some((t) => t === "vegetarian" || t === "vegan") },
  { key: "pescatarian", label: "🐟 Pescatarian", test: (r) => (r.tags||[]).some((t) => t === "pescatarian") },
  { key: "egg", label: "🥚 Egg", test: (r) => (r.labels||[]).some((l) => l === "eggs" || l === "egg") },
  { key: "dairy", label: "🥛 Dairy", test: (r) => { const s = new Set(["milk","butter","cream","heavy cream","sour cream","feta","parmesan","mozzarella","ricotta","mascarpone","cheddar cheese","goat cheese","greek yogurt","cottage cheese"]); return (r.labels||[]).some((l) => s.has(l)); } },
  { key: "meat", label: "🥩 Meat", test: (r) => { const s = new Set(["chicken","beef","ground beef","ground chicken","ground pork","pork","ham"]); return (r.labels||[]).some((l) => s.has(l)); } },
];

const views = {
  recipes: document.querySelector("#recipesView"),
  pantry: document.querySelector("#pantryView"),
  planner: document.querySelector("#plannerView"),
  shopping: document.querySelector("#shoppingView"),
  stats: document.querySelector("#statsView")
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
document.querySelector("#heatmapMonth").addEventListener("change", () => {
  const month = document.querySelector("#heatmapMonth").value;
  history.replaceState(null, "", `#calendar/${month}`);
  renderPlanner();
});

window.addEventListener("popstate", applyHash);

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
  if (hash === "#shopping" || hash.startsWith("#shopping?")) { showView("shopping"); return; }
  if (hash === "#stats") { showView("stats"); return; }
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
  } else if (name === "stats") {
    history.replaceState(null, "", "#stats");
    renderStats();
  } else {
    history.replaceState(null, "", "#recipes");
  }
}

function renderFilterControls() {
  renderCookedChips();
  renderDietChips();
}

function renderCookedChips() {
  const container = document.querySelector("#cookedFilters");
  container.innerHTML = "";
  [{ key: "cooked", label: "Cooked" }, { key: "uncooked", label: "Not yet tried" }].forEach(({ key, label }) => {
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.type = "button";
    chip.textContent = label;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      toggleFilter("cooked", key);
      chip.setAttribute("aria-pressed", String(activeFilters.cooked.has(key)));
      renderRecipes();
    });
    container.append(chip);
  });
}

function renderDietChips() {
  const container = document.querySelector("#dietFilters");
  container.innerHTML = "";
  dietOptions.forEach((opt) => {
    const chip = document.createElement("button");
    chip.className = "filter-chip";
    chip.type = "button";
    chip.textContent = opt.label;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      toggleFilter("diet", opt.key);
      chip.setAttribute("aria-pressed", String(activeFilters.diet.has(opt.key)));
      renderRecipes();
    });
    container.append(chip);
  });
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
      const isCooked = recipe.dates_cooked && recipe.dates_cooked.length > 0;
      const matchesCooked = !activeFilters.cooked.size ||
        (activeFilters.cooked.has("cooked") && isCooked) ||
        (activeFilters.cooked.has("uncooked") && !isCooked);
      const matchesDiet = [...activeFilters.diet].every((key) => dietOptions.find((o) => o.key === key)?.test(recipe));
      return matchesSearch && matchesCooked && matchesDiet;
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
  const tags = recipe.tags || [];
  const labels = recipe.labels || [];
  const isVeg = tags.some((t) => t === "vegetarian" || t === "vegan");
  const isPesc = !isVeg && tags.some((t) => t === "pescatarian");
  const hasEgg = labels.some((l) => l === "eggs" || l === "egg");
  const dairyLabels = new Set(["milk","butter","cream","heavy cream","sour cream","feta","parmesan","mozzarella","ricotta","mascarpone","cheddar cheese","goat cheese","greek yogurt","cottage cheese"]);
  const meatLabels = new Set(["chicken","beef","ground beef","ground chicken","ground pork","pork","ham"]);
  const hasDairy = labels.some((l) => dairyLabels.has(l));
  const hasMeat = labels.some((l) => meatLabels.has(l));
  const isDisliked = tags.some((t) => t === "disliked");
  const dietBadge = isVeg ? ' <span class="diet-badge" title="Vegetarian">🌿</span>' : isPesc ? ' <span class="diet-badge" title="Pescatarian">🐟</span>' : "";
  const eggBadge = hasEgg ? ' <span class="diet-badge" title="Contains egg">🥚</span>' : "";
  const dairyBadge = hasDairy ? ' <span class="diet-badge" title="Contains dairy">🥛</span>' : "";
  const meatBadge = hasMeat ? ' <span class="diet-badge" title="Contains meat">🥩</span>' : "";
  const dislikedBadge = isDisliked ? ' <span class="diet-badge" title="Didn\'t like this">👎</span>' : "";
  item.innerHTML = `
    <summary>
      <span class="cooked-dot${cooked ? " cooked-dot-yes" : ""}" title="${cooked ? `Cooked ${recipe.dates_cooked.length}x` : "Never cooked"}"></span>${escapeHtml(displayTitle)}${dietBadge}${eggBadge}${dairyBadge}${meatBadge}${dislikedBadge}
    </summary>
    <div class="recipe-preview">
      ${recipe.image ? `<img class="recipe-preview-img" src="${escapeHtml(recipe.image)}" alt="${escapeHtml(displayTitle)}" loading="lazy">` : ""}
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
    const isAdded = () => loadShoppingList().some((i) => i.ingredient === btn.dataset.ingredient && i.recipeId === btn.dataset.recipeId);
    const updateBtn = () => {
      const added = isAdded();
      btn.classList.toggle("ingredient-added", added);
      btn.textContent = (added ? "✓ " : "+ ") + btn.dataset.ingredient;
    };
    updateBtn();
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (isAdded()) {
        removeFromShoppingList(btn.dataset.ingredient, btn.dataset.recipeId);
      } else {
        addToShoppingList(btn.dataset.ingredient, btn.dataset.recipeTitle, btn.dataset.recipeId);
      }
      updateBtn();
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

function renderStats() {
  renderStatsMealsPerMonth();
  renderStatsMostCooked();
  renderStatsBySection();
  renderStatsCookedRatio();
}

function renderStatsMealsPerMonth() {
  const el = document.querySelector("#statsMealsPerMonth");
  el.innerHTML = "<h3>Meals cooked per month</h3>";

  const counts = {};
  (siteData.meal_log || []).forEach(({ date }) => {
    const month = date.slice(0, 7);
    counts[month] = (counts[month] || 0) + 1;
  });

  const months = Object.keys(counts).sort();
  if (!months.length) { el.append(emptyState("No meals logged yet.")); return; }

  const max = Math.max(...Object.values(counts));
  const W = 480, H = 200, padL = 36, padB = 48, padT = 12, padR = 12;
  const barW = Math.min(32, Math.floor((W - padL - padR) / months.length) - 4);
  const gap = (W - padL - padR - barW * months.length) / (months.length - 1 || 1);

  const rects = months.map((m, i) => {
    const x = padL + i * (barW + gap);
    const h = Math.round(((H - padT - padB) * counts[m]) / max);
    const y = H - padB - h;
    const label = m.slice(5) + "/" + m.slice(2, 4);
    return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="var(--accent)"/>
      <text x="${x + barW / 2}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="var(--muted)" transform="rotate(-40,${x + barW / 2},${H - padB + 14})">${label}</text>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" fill="var(--text)">${counts[m]}</text>`;
  });

  const yLines = [0, Math.ceil(max / 2), max].map((v) => {
    const y = H - padB - Math.round(((H - padT - padB) * v) / max);
    return `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 3"/>
      <text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${v}</text>`;
  });

  el.innerHTML += `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px">${yLines.join("")}${rects.join("")}</svg>`;
}

function renderStatsMostCooked() {
  const el = document.querySelector("#statsMostCooked");
  el.innerHTML = "<h3>Most cooked</h3>";

  const counts = {};
  (siteData.meal_log || []).forEach(({ recipe }) => {
    counts[recipe] = (counts[recipe] || 0) + 1;
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!sorted.length) { el.append(emptyState("No meals logged yet.")); return; }

  const max = sorted[0][1];
  const list = document.createElement("ol");
  list.className = "stats-ranked-list";
  sorted.forEach(([id, count]) => {
    const recipe = siteData.recipes.find((r) => r.id === id);
    const title = recipe ? recipe.title.replace(/\s*\(favorite!\)\s*/i, "").trim() : id;
    const pct = Math.round((count / max) * 100);
    const li = document.createElement("li");
    li.innerHTML = `<span class="stats-bar-label">${escapeHtml(title)}</span>
      <span class="stats-bar-track"><span class="stats-bar-fill" style="width:${pct}%"></span></span>
      <span class="stats-bar-count">${count}x</span>`;
    list.append(li);
  });
  el.append(list);
}

function renderStatsBySection() {
  const el = document.querySelector("#statsBySection");
  el.innerHTML = "<h3>Recipes by section</h3>";

  const counts = {};
  (siteData.recipes || []).forEach((r) => {
    const s = r.section || "Other";
    counts[s] = (counts[s] || 0) + 1;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const colors = ["var(--accent)", "var(--accent-strong)", "#b07d3a", "#6a8c5a", "#7a6a9a", "#5a8c8c"];

  const SIZE = 180, cx = SIZE / 2, cy = SIZE / 2, r = 72, ri = 44;
  let angle = -Math.PI / 2;
  const slices = entries.map(([label, count], i) => {
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    angle += sweep;
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle);
    const xi1 = cx + ri * Math.cos(angle - sweep), yi1 = cy + ri * Math.sin(angle - sweep);
    const xi2 = cx + ri * Math.cos(angle), yi2 = cy + ri * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${ri},${ri} 0 ${large} 0 ${xi1},${yi1} Z`;
    return `<path d="${path}" fill="${colors[i % colors.length]}" stroke="var(--bg)" stroke-width="2"/>`;
  });

  const legend = entries.map(([label, count], i) =>
    `<li><span class="legend-dot" style="background:${colors[i % colors.length]}"></span>${escapeHtml(label)} <span class="stats-muted">${count}</span></li>`
  ).join("");

  el.innerHTML += `<div class="stats-donut-wrap">
    <svg viewBox="0 0 ${SIZE} ${SIZE}" style="width:${SIZE}px;flex-shrink:0">${slices.join("")}</svg>
    <ul class="stats-legend">${legend}</ul>
  </div>`;
}

function renderStatsCookedRatio() {
  const el = document.querySelector("#statsCookedRatio");
  const total = siteData.recipes.length;
  const cooked = siteData.recipes.filter((r) => r.dates_cooked && r.dates_cooked.length > 0).length;
  const pct = Math.round((cooked / total) * 100);

  el.innerHTML = `<h3>Cooked vs. never tried</h3>
    <div class="stats-ratio-numbers"><span class="stats-big">${cooked}</span><span class="stats-muted"> of ${total} recipes cooked</span></div>
    <div class="stats-ratio-track"><div class="stats-ratio-fill" style="width:${pct}%"></div></div>
    <div class="stats-ratio-labels"><span>${pct}% tried</span><span>${100 - pct}% still to try</span></div>`;
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
        <input type="checkbox" class="shopping-check" id="si-${idx}" ${checked ? "checked" : ""} data-idx="${idx}">
        <label class="shopping-check-label" for="si-${idx}">${escapeHtml(ingredient)}</label>
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
