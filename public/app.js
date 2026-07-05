const SUPABASE_URL = "https://hrwckkwdipilwkjjzyzf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wR-rYtiUnDYrPqjz9rHz5Q_qKYwXZUC";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const tags = ["repas", "dessert", "protéiné", "rapide", "végétarien", "économique", "batch cooking", "Mamounette", "Base", "Le Bat"];

const blankDraft = () => ({
  name: "",
  imageUrl: "",
  ingredients: [""],
  steps: [""],
  referenceUrl: "",
  tags: [],
  collection: ""
});

const state = {
  recipes: [],
  user: null,
  profile: null,
  search: "",
  searchDraft: "",
  selectedTags: new Set(),
  selectedCollection: "",
  pendingAuthAction: null,
  authMode: "signin",
  wizardStep: 0,
  draft: blankDraft(),
  editingRecipeId: null
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const adminDialog = document.querySelector("#adminDialog");
const adminForm = document.querySelector("#adminForm");
const authDialogTitle = document.querySelector("#authDialogTitle");
const authDialogIntro = document.querySelector("#authDialogIntro");
const displayNameField = document.querySelector("#displayNameField");
const displayNameInput = document.querySelector("#displayNameInput");
const adminEmail = document.querySelector("#adminEmail");
const adminPassword = document.querySelector("#adminPassword");
const authIdentifierLabel = document.querySelector("#authIdentifierLabel");
const passwordField = document.querySelector("#passwordField");
const adminError = document.querySelector("#adminError");
const authSubmitButton = document.querySelector("#authSubmitButton");
const forgotPasswordButton = document.querySelector("#forgotPasswordButton");
const toggleAuthModeButton = document.querySelector("#toggleAuthModeButton");
const addRecipeButton = document.querySelector("#addRecipeButton");
const adminStatusButton = document.querySelector("#adminStatusButton");
const signOutButton = document.querySelector("#signOutButton");
const userWelcome = document.querySelector("#userWelcome");
const closeAdminDialog = document.querySelector("#closeAdminDialog");
let searchDebounceTimer = null;
let hasBootstrapped = false;
let authRefreshQueue = Promise.resolve();

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric"
});

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return dateFormatter.format(new Date(value));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} prend trop de temps. Vérifie ta connexion puis réessaie.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function friendlyAuthError(error) {
  const message = String(error?.message || "");
  if (message.includes("Invalid login credentials")) {
    return "Email ou mot de passe incorrect. Si tu viens de créer ton compte, vérifie aussi tes emails.";
  }
  if (message.includes("Email not confirmed")) {
    return "Ton email n'est pas encore confirmé. Ouvre le lien reçu par email puis réessaie.";
  }
  if (message.includes("Password should be")) {
    return "Le mot de passe est trop court. Choisis au moins 6 caractères.";
  }
  if (message.includes("User already registered")) {
    return "Un compte existe déjà avec cet email. Utilise Connexion ou Mot de passe oublié.";
  }
  if (message.includes("Unable to validate email address")) {
    return "L'adresse email ne semble pas valide.";
  }
  return message || "Une erreur est survenue.";
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function mapRecipe(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    name: row.name,
    imageUrl: row.image_url || "",
    ingredients: row.ingredients || [],
    steps: row.steps || [],
    referenceUrl: row.reference_url || "",
    tags: row.tags || [],
    collection: row.collection || "",
    publishedAt: row.created_at
  };
}

function canEditRecipe(recipe) {
  return Boolean(state.user && (state.profile?.role === "admin" || recipe.authorId === state.user.id));
}

function canDeleteRecipe() {
  return Boolean(state.user && state.profile?.role === "admin");
}

function draftFromRecipe(recipe) {
  return {
    name: recipe.name || "",
    imageUrl: recipe.imageUrl || "",
    ingredients: recipe.ingredients?.length ? [...recipe.ingredients] : [""],
    steps: recipe.steps?.length ? [...recipe.steps] : [""],
    referenceUrl: recipe.referenceUrl || "",
    tags: recipe.tags?.filter((tag) => tags.includes(tag)) || [],
    collection: recipe.collection || ""
  };
}

function startNewRecipe() {
  state.editingRecipeId = null;
  state.draft = blankDraft();
  state.wizardStep = 0;
  window.location.hash = "#/add";
}

function startRecipeEdit(recipe) {
  state.editingRecipeId = recipe.id;
  state.draft = draftFromRecipe(recipe);
  state.wizardStep = 0;
  window.location.hash = `#/edit/${encodeURIComponent(recipe.id)}`;
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", state.user.id)
    .single();

  if (error) throw error;
  state.profile = data;
}

async function hydrateUserData() {
  if (!state.user) {
    state.profile = null;
    state.recipes = [];
    return;
  }

  const [profileResult, recipesResult] = await Promise.allSettled([
    withTimeout(loadProfile(), 10000, "Le chargement du profil"),
    withTimeout(loadRecipes(), 10000, "Le chargement des recettes")
  ]);

  if (profileResult.status === "rejected") {
    console.warn("Impossible de charger le profil", profileResult.reason);
    state.profile = {
      id: state.user.id,
      display_name: state.user.user_metadata?.display_name || state.user.email || "Compte",
      role: "user"
    };
  }

  if (recipesResult.status === "rejected") {
    throw recipesResult.reason;
  }
}

async function loadRecipes() {
  const { data, error } = await supabaseClient
    .from("recipes")
    .select("id, author_id, name, image_url, ingredients, steps, reference_url, tags, collection, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  state.recipes = data.map(mapRecipe);
}

async function loadData() {
  const { data, error } = await withTimeout(supabaseClient.auth.getSession(), 10000, "La vérification de session");
  if (error) throw error;

  state.user = data.session?.user || null;
  await hydrateUserData();
  updateAdminUi();
}

function updateAdminUi() {
  if (!state.user) {
    if (adminStatusButton) {
      adminStatusButton.textContent = "Connexion";
      adminStatusButton.hidden = true;
      adminStatusButton.classList.remove("is-admin");
    }
    if (addRecipeButton) addRecipeButton.hidden = true;
    if (signOutButton) signOutButton.hidden = true;
    if (userWelcome) {
      userWelcome.hidden = true;
      userWelcome.textContent = "";
    }
    return;
  }

  const label = state.profile?.display_name || state.user.email || "Compte";
  if (userWelcome) {
    userWelcome.textContent = `Bienvenue ${label}`;
    userWelcome.hidden = false;
  }
  if (adminStatusButton) {
    adminStatusButton.hidden = true;
    adminStatusButton.classList.toggle("is-admin", state.profile?.role === "admin");
  }
  if (addRecipeButton) addRecipeButton.hidden = false;
  if (signOutButton) signOutButton.hidden = false;
}

function collections() {
  return [...new Set(state.recipes.map((recipe) => recipe.collection).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

function filteredRecipes() {
  const query = state.search.trim().toLowerCase();
  return state.recipes.filter((recipe) => {
    const matchesSearch =
      !query ||
      recipe.name.toLowerCase().includes(query) ||
      recipe.ingredients.some((ingredient) => ingredient.toLowerCase().includes(query)) ||
      recipe.tags.some((tag) => tag.toLowerCase().includes(query)) ||
      recipe.collection.toLowerCase().includes(query) ||
      (recipe.referenceUrl || "").toLowerCase().includes(query);

    const matchesTags =
      state.selectedTags.size === 0 || [...state.selectedTags].every((tag) => recipe.tags.includes(tag));

    const matchesCollection = !state.selectedCollection || recipe.collection === state.selectedCollection;

    return matchesSearch && matchesTags && matchesCollection;
  });
}

function scheduleSearchUpdate(value) {
  state.searchDraft = value;
  window.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = window.setTimeout(() => {
    state.search = state.searchDraft;
    renderHome({ focusSearch: true });
  }, 450);
}

function recipeCard(recipe) {
  const preparationLabel =
    recipe.steps && recipe.steps.length > 0
      ? `${recipe.steps.length} étape${recipe.steps.length > 1 ? "s" : ""}`
      : "Lien source";

  return `
    <a class="recipe-card" href="#/recipe/${encodeURIComponent(recipe.id)}">
      ${recipeImageTemplate(recipe, "recipe-card-image", "loading=\"lazy\"")}
      <div class="recipe-card-content">
        <div class="meta-row">
          <span class="muted">${escapeHtml(formatDate(recipe.publishedAt))}</span>
          ${recipe.collection ? `<span class="collection-pill">${escapeHtml(recipe.collection)}</span>` : ""}
        </div>
        <h3>${escapeHtml(recipe.name)}</h3>
        <div class="recipe-card-stats">
          <span>${recipe.ingredients.length} ingrédient${recipe.ingredients.length > 1 ? "s" : ""}</span>
          <span>${escapeHtml(preparationLabel)}</span>
        </div>
        <div class="tag-row">
          ${recipe.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    </a>
  `;
}

function renderLockedHome() {
  app.innerHTML = `
    <section class="locked-shell" aria-labelledby="lockedTitle">
      <div class="locked-card">
        <p class="eyebrow">Accès privé</p>
        <h1 id="lockedTitle">Connecte-toi pour accéder aux recettes.</h1>
        <p class="muted">Le carnet est réservé aux comptes autorisés. Une fois connecté, tu retrouveras les recettes, la recherche et l’ajout.</p>
        <div class="locked-actions">
          <button class="primary-button" id="lockedLoginButton" type="button">Connexion</button>
          <button class="secondary-button" id="lockedSignupButton" type="button">Créer un compte</button>
        </div>
      </div>
    </section>
  `;

  document.querySelector("#lockedLoginButton").addEventListener("click", () => requestAuth(null));
  document.querySelector("#lockedSignupButton").addEventListener("click", () => requestAuth(null, "signup"));
}

function renderHome(options = {}) {
  const visibleRecipes = filteredRecipes();
  const allCollections = collections();

  app.innerHTML = `
    <section class="hero" aria-labelledby="homeTitle">
      <div class="hero-copy">
        <p class="eyebrow">Recettes partagées</p>
        <h1 id="homeTitle">Toutes les recettes au même endroit.</h1>
        <p>Recherche, filtre et publie tes recettes avec ton compte. La suppression est réservée à l’admin.</p>
      </div>
      <figure class="hero-panel">
        <img src="https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80" alt="Table de cuisine avec ingrédients frais">
        <figcaption>${state.recipes.length} recette${state.recipes.length > 1 ? "s" : ""} publiée${state.recipes.length > 1 ? "s" : ""}</figcaption>
      </figure>
    </section>

    <section class="control-panel" aria-label="Recherche et filtres">
      <div class="toolbar">
        <label class="search-box">
          <span>Recherche</span>
          <input id="searchInput" type="search" value="${escapeHtml(state.searchDraft)}" placeholder="Nom, ingrédient, tag..." autocomplete="off">
        </label>
        <label class="select-box">
          <span>Collection</span>
          <select id="collectionFilter">
            <option value="">Toutes les listes</option>
            ${allCollections
              .map(
                (collection) =>
                  `<option value="${escapeHtml(collection)}" ${state.selectedCollection === collection ? "selected" : ""}>${escapeHtml(collection)}</option>`
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="filters" aria-label="Filtres par tags">
        ${tags
          .map(
            (tag) =>
              `<button class="chip ${state.selectedTags.has(tag) ? "is-active" : ""}" data-tag="${escapeHtml(tag)}" type="button">${escapeHtml(tag)}</button>`
          )
          .join("")}
      </div>
    </section>

    <section aria-labelledby="recipesTitle">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Dernières publications</p>
          <h2 id="recipesTitle">Recettes disponibles</h2>
        </div>
        <p class="muted">${visibleRecipes.length} résultat${visibleRecipes.length > 1 ? "s" : ""}</p>
      </div>
      ${
        state.recipes.length === 0
          ? `<div class="empty-state"><div><h3>Aucune recette pour le moment</h3><p class="muted">Connecte-toi pour publier la première recette.</p></div></div>`
          : visibleRecipes.length === 0
            ? `<div class="empty-state"><div><h3>Aucune recette trouvée</h3><p class="muted">Essaie une autre recherche, retire un tag ou change de collection.</p></div></div>`
            : `<div class="recipes-grid">${visibleRecipes.map(recipeCard).join("")}</div>`
      }
    </section>
  `;

  const searchInput = document.querySelector("#searchInput");
  searchInput.addEventListener("input", (event) => scheduleSearchUpdate(event.target.value));
  if (options.focusSearch) {
    searchInput.focus({ preventScroll: true });
    searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
  }

  document.querySelector("#collectionFilter").addEventListener("change", (event) => {
    state.selectedCollection = event.target.value;
    renderHome();
  });

  document.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.tag;
      if (state.selectedTags.has(tag)) state.selectedTags.delete(tag);
      else state.selectedTags.add(tag);
      renderHome();
    });
  });
}

function renderDetail(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) {
    app.innerHTML = `<div class="empty-state"><div><h2>Recette introuvable</h2><p class="muted">Elle a peut-être été supprimée.</p><p><a class="secondary-button" href="#/">Retour aux recettes</a></p></div></div>`;
    return;
  }

  app.innerHTML = `
    <div class="detail-layout">
      <article class="detail-main">
        ${recipeImageTemplate(recipe, "detail-hero-image")}
        <div class="detail-content">
          <p class="eyebrow">Publié le ${escapeHtml(formatDate(recipe.publishedAt))}</p>
          <h1>${escapeHtml(recipe.name)}</h1>
          <div class="tag-row" style="margin-top: 18px;">
            ${recipe.collection ? `<span class="collection-pill">${escapeHtml(recipe.collection)}</span>` : ""}
            ${recipe.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
      </article>

      <aside class="side-panel">
        <div class="side-summary">
          <p class="eyebrow">Résumé</p>
          <div class="summary-grid">
            <span><strong>${recipe.ingredients.length}</strong> ingrédients</span>
            <span><strong>${recipe.steps.length || (recipe.referenceUrl ? 1 : 0)}</strong> ${recipe.steps.length ? "étapes" : "source"}</span>
          </div>
        </div>
        <a class="secondary-button full-width" href="#/">Retour aux recettes</a>
        ${canEditRecipe(recipe) ? `<button class="secondary-button full-width" id="editRecipeButton" type="button">Modifier la recette</button>` : ""}
        ${canDeleteRecipe(recipe) ? `<button class="danger-button full-width" id="deleteRecipeButton" type="button">Supprimer la recette</button>` : ""}
      </aside>
    </div>

    <section class="detail-layout" style="margin-top: 26px;">
      <div class="detail-main detail-content">
        <p class="eyebrow">Ingrédients</p>
        <h2>À prévoir</h2>
        <ul class="content-list">
          ${recipe.ingredients.map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("")}
        </ul>
      </div>
      <div class="detail-main detail-content">
        <p class="eyebrow">Préparation</p>
        <h2>Étapes</h2>
        ${
          recipe.steps && recipe.steps.length > 0
            ? `<ol class="content-list steps-list">
                ${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
              </ol>`
            : `<p class="muted">Aucune étape détaillée n’a été ajoutée.</p>`
        }
      </div>
    </section>
    ${referenceBlockTemplate(recipe)}
  `;

  const editButton = document.querySelector("#editRecipeButton");
  if (editButton) editButton.addEventListener("click", () => startRecipeEdit(recipe));

  const deleteButton = document.querySelector("#deleteRecipeButton");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const confirmed = window.confirm(`Supprimer définitivement "${recipe.name}" ?`);
      if (!confirmed) return;

      try {
        const { error } = await supabaseClient.from("recipes").delete().eq("id", recipe.id);
        if (error) throw error;
        state.recipes = state.recipes.filter((item) => item.id !== recipe.id);
        showToast("Recette supprimée.");
        window.location.hash = "#/";
      } catch (error) {
        showToast(error.message);
      }
    });
  }
}

function renderEditWizard(id) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) {
    app.innerHTML = `<div class="empty-state"><div><h2>Recette introuvable</h2><p class="muted">Elle a peut-être été supprimée.</p><p><a class="secondary-button" href="#/">Retour aux recettes</a></p></div></div>`;
    return;
  }

  if (!canEditRecipe(recipe)) {
    state.editingRecipeId = null;
    state.draft = blankDraft();
    state.wizardStep = 0;
    app.innerHTML = `<div class="empty-state"><div><h2>Accès refusé</h2><p class="muted">Seul l’auteur de la recette ou l’admin peut la modifier.</p><p><a class="secondary-button" href="#/recipe/${encodeURIComponent(recipe.id)}">Retour à la recette</a></p></div></div>`;
    return;
  }

  if (state.editingRecipeId !== recipe.id) {
    state.editingRecipeId = recipe.id;
    state.draft = draftFromRecipe(recipe);
    state.wizardStep = 0;
  }

  renderWizard();
}

function referenceBlockTemplate(recipe) {
  if (!recipe.referenceUrl) return "";

  return `
    <section class="detail-main detail-content reference-block" aria-labelledby="recipeReferenceTitle">
      <p class="eyebrow">Source</p>
      <h2 id="recipeReferenceTitle">Lien vers la recette</h2>
      <a class="reference-link" href="${escapeHtml(recipe.referenceUrl)}" target="_blank" rel="noopener noreferrer">
        Ouvrir le lien de référence
      </a>
    </section>
  `;
}

function recipeImageTemplate(recipe, className = "", attributes = "") {
  if (recipe.imageUrl) {
    return `<img class="${className}" src="${escapeHtml(recipe.imageUrl)}" alt="${escapeHtml(recipe.name)}" ${attributes}>`;
  }

  return `
    <div class="image-placeholder ${className}" role="img" aria-label="Pas d'image pour ${escapeHtml(recipe.name)}">
      <span>Sans image</span>
    </div>
  `;
}

const stepLabels = ["Nom", "Image", "Ingrédients", "Préparation", "Tags", "Vérification"];
const requiredSteps = new Set([0, 2, 3, 4, 5]);

function validateStep(stepIndex, draft = normalizedDraft()) {
  const errors = [];

  if (stepIndex === 0 && !draft.name) errors.push("Le nom de la recette est obligatoire.");
  if (stepIndex === 1 && draft.imageUrl) {
    try {
      const url = new URL(draft.imageUrl);
      if (!["http:", "https:"].includes(url.protocol)) errors.push("L'image doit être une URL http ou https.");
    } catch {
      errors.push("Ajoute une URL d'image valide.");
    }
  }
  if (stepIndex === 2 && draft.ingredients.length === 0) errors.push("Ajoute au moins un ingrédient.");
  if (stepIndex === 3 && draft.steps.length === 0 && !draft.referenceUrl) {
    errors.push("Ajoute au moins une étape ou un lien vers la recette.");
  }
  if (stepIndex === 3 && draft.referenceUrl) {
    try {
      const url = new URL(draft.referenceUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        errors.push("Le lien vers la recette doit être une URL http ou https.");
      }
    } catch {
      errors.push("Ajoute un lien vers la recette valide.");
    }
  }
  if (stepIndex === 4 && draft.tags.length === 0) errors.push("Sélectionne au moins un tag.");

  return errors;
}

function validateCurrentStep() {
  return validateStep(state.wizardStep);
}

function firstBlockingStepBefore(targetStep) {
  for (let step = 0; step < targetStep; step += 1) {
    const errors = validateStep(step);
    if (errors.length > 0) return { step, message: errors[0] };
  }
  return null;
}

function stepRequirementLabel(stepIndex) {
  return requiredSteps.has(stepIndex) ? "Obligatoire" : "Optionnelle";
}

function requirementBadge(stepIndex) {
  const label = stepRequirementLabel(stepIndex);
  const modifier = requiredSteps.has(stepIndex) ? "is-required" : "is-optional";
  return `<span class="requirement-badge ${modifier}">${label}</span>`;
}

function normalizedDraft() {
  return {
    ...state.draft,
    name: state.draft.name.trim(),
    imageUrl: state.draft.imageUrl.trim(),
    ingredients: state.draft.ingredients.map((item) => item.trim()).filter(Boolean),
    steps: state.draft.steps.map((item) => item.trim()).filter(Boolean),
    referenceUrl: state.draft.referenceUrl.trim(),
    tags: state.draft.tags.filter((tag) => tags.includes(tag)),
    collection: state.draft.collection.trim()
  };
}

function renderWizard() {
  if (!state.user) {
    requestAuth(() => {
      window.location.hash = state.editingRecipeId ? `#/edit/${encodeURIComponent(state.editingRecipeId)}` : "#/add";
    });
    window.location.hash = "#/";
    return;
  }

  const editingRecipe = state.editingRecipeId
    ? state.recipes.find((recipe) => recipe.id === state.editingRecipeId)
    : null;
  const isEditing = Boolean(editingRecipe);
  const progress = ((state.wizardStep + 1) / stepLabels.length) * 100;
  const currentRequirement = stepRequirementLabel(state.wizardStep);

  app.innerHTML = `
    <section class="wizard-shell" aria-labelledby="wizardTitle">
      <div class="wizard-header">
        <div>
          <p class="eyebrow">${isEditing ? "Modification de recette" : "Nouvelle recette"}</p>
          <div class="wizard-title-row">
            <h1 id="wizardTitle">${escapeHtml(stepLabels[state.wizardStep])}</h1>
            ${requirementBadge(state.wizardStep)}
          </div>
          <p class="muted">${currentRequirement === "Obligatoire" ? "Cette étape doit être complétée pour continuer." : "Cette étape peut être passée sans contenu."}</p>
        </div>
        <div class="progress-rail" aria-hidden="true"><div class="progress-bar" style="width: ${progress}%"></div></div>
        <div class="step-dots">
          ${stepLabels
            .map(
              (label, index) =>
                `<button class="step-dot ${index === state.wizardStep ? "is-active" : ""}" data-step="${index}" type="button">
                  <span>${index + 1}. ${escapeHtml(label)}</span>
                  <small>${stepRequirementLabel(index)}</small>
                </button>`
            )
            .join("")}
        </div>
      </div>

      <div class="wizard-body">${wizardStepTemplate()}</div>
      <p class="form-error" id="wizardError" role="alert"></p>
      <div class="wizard-actions">
        <button class="secondary-button" id="previousStepButton" type="button" ${state.wizardStep === 0 ? "disabled" : ""}>Précédent</button>
        ${
          state.wizardStep === stepLabels.length - 1
            ? `<button class="primary-button" id="publishButton" type="button">${isEditing ? "Sauvegarder les modifications" : "Publier la recette"}</button>`
            : `<button class="primary-button" id="nextStepButton" type="button">Suivant</button>`
        }
      </div>
    </section>
  `;

  bindWizardEvents();
}

function wizardStepTemplate() {
  const draft = state.draft;

  if (state.wizardStep === 0) {
    return `
      <label class="field">
        <span>Nom de la recette ${requirementBadge(0)}</span>
        <input id="recipeName" value="${escapeHtml(draft.name)}" placeholder="Ex. Curry de lentilles corail" required>
      </label>
    `;
  }

  if (state.wizardStep === 1) {
    return `
      <label class="field">
        <span>URL de l'image ${requirementBadge(1)}</span>
        <input id="recipeImageUrl" value="${escapeHtml(draft.imageUrl)}" placeholder="https://...">
      </label>
      <div class="image-preview" id="imagePreview">${imagePreviewTemplate(draft.imageUrl)}</div>
    `;
  }

  if (state.wizardStep === 2) {
    return `
      <div class="field">
        <span>Ingrédients ${requirementBadge(2)}</span>
        <div class="dynamic-list" id="ingredientsList">
          ${draft.ingredients.map((ingredient, index) => dynamicRow("ingredient", ingredient, index)).join("")}
        </div>
      </div>
      <button class="secondary-button" id="addIngredientButton" type="button">Ajouter un ingrédient</button>
    `;
  }

  if (state.wizardStep === 3) {
    return `
      <div class="field">
        <span>Préparation ${requirementBadge(3)}</span>
        <div class="dynamic-list" id="stepsList">
          ${draft.steps.map((step, index) => dynamicRow("step", step, index)).join("")}
        </div>
      </div>
      <button class="secondary-button" id="addStepButton" type="button">Ajouter une étape</button>
      <label class="field">
        <span>Lien vers la recette</span>
        <input id="recipeReferenceUrl" value="${escapeHtml(draft.referenceUrl)}" placeholder="https://www.instagram.com/p/...">
      </label>
      <p class="muted">Complète cette étape avec au moins une étape écrite ou un lien source.</p>
    `;
  }

  if (state.wizardStep === 4) {
    return `
      <label class="field">
        <span>Collection optionnelle</span>
        <input id="recipeCollection" value="${escapeHtml(draft.collection)}" placeholder="Ex. Semaine, Desserts, À tester">
      </label>
      <div class="field">
        <span>Tags ${requirementBadge(4)}</span>
        <div class="filters">
          ${tags
            .map(
              (tag) =>
                `<button class="chip ${draft.tags.includes(tag) ? "is-active" : ""}" data-wizard-tag="${escapeHtml(tag)}" type="button">${escapeHtml(tag)}</button>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  const recipe = normalizedDraft();
  return `
    <article class="review-card">
      ${recipeImageTemplate(recipe, "review-image")}
      <div>
        <p class="eyebrow">Vérification obligatoire</p>
        <h2>${escapeHtml(recipe.name || "Recette sans nom")}</h2>
        <div class="tag-row" style="margin-top: 14px;">
          ${recipe.collection ? `<span class="collection-pill">${escapeHtml(recipe.collection)}</span>` : ""}
          ${recipe.tags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}
          ${recipe.tags.length === 0 ? `<span class="muted">Aucun tag sélectionné</span>` : ""}
        </div>
      </div>
      <div>
        <h3>Ingrédients</h3>
        <ul class="content-list">${recipe.ingredients.map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("")}</ul>
      </div>
      <div>
        <h3>Préparation</h3>
        ${
          recipe.steps.length > 0
            ? `<ol class="content-list steps-list">${recipe.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`
            : `<p class="muted">Aucune étape détaillée ajoutée.</p>`
        }
      </div>
      ${
        recipe.referenceUrl
          ? `<div>
              <h3>Lien vers la recette</h3>
              <a class="reference-link" href="${escapeHtml(recipe.referenceUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien de référence</a>
            </div>`
          : ""
      }
    </article>
  `;
}

function imagePreviewTemplate(url) {
  if (!url.trim()) return `<span>Image optionnelle : tu peux passer cette étape sans URL.</span>`;
  return `<img src="${escapeHtml(url)}" alt="Aperçu de l'image" onerror="this.parentElement.innerHTML='<span>Impossible de charger cette image. Vérifie l’URL.</span>'">`;
}

function dynamicRow(type, value, index) {
  const placeholder = type === "ingredient" ? "200 g de chocolat noir" : "Décrire cette étape";
  return `
    <div class="dynamic-row">
      <input data-${type}-index="${index}" value="${escapeHtml(value)}" placeholder="${placeholder}">
      <button class="icon-button" data-remove-${type}="${index}" type="button" aria-label="Supprimer cette ligne">×</button>
    </div>
  `;
}

function bindWizardEvents() {
  const wizardError = document.querySelector("#wizardError");

  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetStep = Number(button.dataset.step);
      const blocked = firstBlockingStepBefore(targetStep);
      if (blocked) {
        state.wizardStep = blocked.step;
        renderWizard();
        window.setTimeout(() => {
          const error = document.querySelector("#wizardError");
          if (error) error.textContent = blocked.message;
        }, 0);
        return;
      }
      state.wizardStep = targetStep;
      renderWizard();
    });
  });

  document.querySelector("#previousStepButton").addEventListener("click", () => {
    state.wizardStep = Math.max(0, state.wizardStep - 1);
    renderWizard();
  });

  const nextButton = document.querySelector("#nextStepButton");
  if (nextButton) {
    nextButton.addEventListener("click", () => {
      const errors = validateCurrentStep();
      if (errors.length > 0) {
        wizardError.textContent = errors[0];
        return;
      }
      state.wizardStep += 1;
      renderWizard();
    });
  }

  const publishButton = document.querySelector("#publishButton");
  if (publishButton) publishButton.addEventListener("click", saveRecipe);

  const nameInput = document.querySelector("#recipeName");
  if (nameInput) nameInput.addEventListener("input", (event) => (state.draft.name = event.target.value));

  const imageInput = document.querySelector("#recipeImageUrl");
  if (imageInput) {
    imageInput.addEventListener("input", (event) => {
      state.draft.imageUrl = event.target.value;
      document.querySelector("#imagePreview").innerHTML = imagePreviewTemplate(state.draft.imageUrl);
    });
  }

  document.querySelectorAll("[data-ingredient-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.draft.ingredients[Number(input.dataset.ingredientIndex)] = event.target.value;
    });
  });

  document.querySelectorAll("[data-step-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.draft.steps[Number(input.dataset.stepIndex)] = event.target.value;
    });
  });

  const referenceInput = document.querySelector("#recipeReferenceUrl");
  if (referenceInput) {
    referenceInput.addEventListener("input", (event) => {
      state.draft.referenceUrl = event.target.value;
    });
  }

  document.querySelectorAll("[data-remove-ingredient]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft.ingredients.splice(Number(button.dataset.removeIngredient), 1);
      if (state.draft.ingredients.length === 0) state.draft.ingredients.push("");
      renderWizard();
    });
  });

  document.querySelectorAll("[data-remove-step]").forEach((button) => {
    button.addEventListener("click", () => {
      state.draft.steps.splice(Number(button.dataset.removeStep), 1);
      if (state.draft.steps.length === 0) state.draft.steps.push("");
      renderWizard();
    });
  });

  const addIngredientButton = document.querySelector("#addIngredientButton");
  if (addIngredientButton) {
    addIngredientButton.addEventListener("click", () => {
      state.draft.ingredients.push("");
      renderWizard();
    });
  }

  const addStepButton = document.querySelector("#addStepButton");
  if (addStepButton) {
    addStepButton.addEventListener("click", () => {
      state.draft.steps.push("");
      renderWizard();
    });
  }

  const collectionInput = document.querySelector("#recipeCollection");
  if (collectionInput) {
    collectionInput.addEventListener("input", (event) => (state.draft.collection = event.target.value));
  }

  document.querySelectorAll("[data-wizard-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      const tag = button.dataset.wizardTag;
      if (state.draft.tags.includes(tag)) {
        state.draft.tags = state.draft.tags.filter((item) => item !== tag);
      } else {
        state.draft.tags.push(tag);
      }
      renderWizard();
    });
  });
}

async function saveRecipe() {
  const publishButton = document.querySelector("#publishButton");
  const wizardError = document.querySelector("#wizardError");
  const recipe = normalizedDraft();
  const editingRecipe = state.editingRecipeId
    ? state.recipes.find((item) => item.id === state.editingRecipeId)
    : null;
  const isEditing = Boolean(editingRecipe);

  if (state.editingRecipeId && !editingRecipe) {
    wizardError.textContent = "Cette recette est introuvable. Retourne au carnet puis réessaie.";
    return;
  }

  if (isEditing && !canEditRecipe(editingRecipe)) {
    wizardError.textContent = "Tu ne peux modifier que tes propres recettes.";
    return;
  }

  const requiredChecks = [
    [recipe.name, "Le nom de la recette est obligatoire."],
    [recipe.ingredients.length > 0, "Ajoute au moins un ingrédient."],
    [recipe.steps.length > 0 || recipe.referenceUrl, "Ajoute au moins une étape ou un lien vers la recette."],
    [recipe.tags.length > 0, "Sélectionne au moins un tag."]
  ];
  const failed = requiredChecks.find(([valid]) => !valid);
  if (failed) {
    wizardError.textContent = failed[1];
    return;
  }

  try {
    publishButton.disabled = true;
    publishButton.textContent = isEditing ? "Sauvegarde..." : "Publication...";

    const payload = {
      name: recipe.name,
      image_url: recipe.imageUrl || null,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      reference_url: recipe.referenceUrl || null,
      tags: recipe.tags,
      collection: recipe.collection,
      is_published: true
    };
    const query = isEditing
      ? supabaseClient
          .from("recipes")
          .update(payload)
          .eq("id", editingRecipe.id)
          .select("id, author_id, name, image_url, ingredients, steps, reference_url, tags, collection, created_at")
          .single()
      : supabaseClient
          .from("recipes")
          .insert({ ...payload, author_id: state.user.id })
          .select("id, author_id, name, image_url, ingredients, steps, reference_url, tags, collection, created_at")
          .single();

    const { data, error } = await query;

    if (error) throw error;

    const savedRecipe = mapRecipe(data);
    if (isEditing) {
      state.recipes = state.recipes.map((item) => (item.id === savedRecipe.id ? savedRecipe : item));
    } else {
      state.recipes.unshift(savedRecipe);
    }
    state.editingRecipeId = null;
    state.draft = blankDraft();
    state.wizardStep = 0;
    showToast(isEditing ? "Modifications sauvegardées." : "Recette publiée.");
    window.location.hash = `#/recipe/${encodeURIComponent(savedRecipe.id)}`;
  } catch (error) {
    wizardError.textContent = error.message;
    publishButton.disabled = false;
    publishButton.textContent = isEditing ? "Sauvegarder les modifications" : "Publier la recette";
  }
}

function updateAuthDialog() {
  const isSignup = state.authMode === "signup";
  const isReset = state.authMode === "reset";

  authDialogTitle.textContent = isSignup ? "Créer un compte" : isReset ? "Mot de passe oublié" : "Connexion";
  authDialogIntro.textContent = isSignup
    ? "Choisis un pseudo, un email et un mot de passe pour publier tes recettes."
    : isReset
      ? "Entre ton email et Supabase t'enverra un lien de réinitialisation."
      : "Connecte-toi avec ton email et ton mot de passe.";
  authIdentifierLabel.textContent = "Email";
  adminEmail.placeholder = "ton@email.com";
  adminEmail.autocomplete = "email";
  displayNameField.hidden = !isSignup;
  passwordField.hidden = isReset;
  adminPassword.required = !isReset;
  forgotPasswordButton.hidden = isSignup || isReset;
  authSubmitButton.textContent = isSignup ? "Créer mon compte" : isReset ? "Envoyer le lien" : "Connexion";
  toggleAuthModeButton.textContent = isSignup || isReset ? "J'ai déjà un compte" : "Créer un compte";
}

function requestAuth(onSuccess, mode = "signin") {
  state.pendingAuthAction = onSuccess;
  state.authMode = mode;
  adminError.textContent = "";
  displayNameInput.value = "";
  adminEmail.value = "";
  adminPassword.value = "";
  updateAuthDialog();
  adminDialog.showModal();
  window.setTimeout(() => adminEmail.focus(), 50);
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  adminError.textContent = "";
  authSubmitButton.disabled = true;

  try {
    const email = adminEmail.value.trim();
    const password = adminPassword.value;
    const displayName = displayNameInput.value.trim();
    let result;

    if (!isEmail(email)) {
      throw new Error("Indique une adresse email valide.");
    }

    if (state.authMode === "reset") {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });
      if (error) throw error;
      adminDialog.close();
      showToast("Email de réinitialisation envoyé.");
      return;
    }

    if (state.authMode === "signup") {
      result = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split("@")[0] },
          emailRedirectTo: window.location.origin
        }
      });
    } else {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
    }

    if (result.error) throw result.error;

    if (state.authMode === "signup" && !result.data.session) {
      adminError.textContent = "Compte créé. Vérifie tes emails pour confirmer l'inscription, puis reviens te connecter.";
      authSubmitButton.textContent = "Compte créé";
      toggleAuthModeButton.textContent = "Aller à la connexion";
      return;
    }

    state.user = result.data.session?.user || result.data.user;
    await hydrateUserData();
    updateAdminUi();
    adminDialog.close();
    showToast(state.authMode === "signup" ? "Compte créé." : "Connexion réussie.");
    if (state.pendingAuthAction) state.pendingAuthAction();
    else route();
    state.pendingAuthAction = null;
  } catch (error) {
    adminError.textContent = friendlyAuthError(error);
  } finally {
    authSubmitButton.disabled = false;
  }
}

function route() {
  const hash = window.location.hash || "#/";
  const recipeMatch = hash.match(/^#\/recipe\/(.+)$/);
  const editMatch = hash.match(/^#\/edit\/(.+)$/);

  if (!state.user) {
    renderLockedHome();
    app.focus({ preventScroll: true });
    return;
  }

  if (hash === "#/" || hash === "#") renderHome();
  else if (hash === "#/add") {
    if (state.editingRecipeId) {
      state.editingRecipeId = null;
      state.draft = blankDraft();
      state.wizardStep = 0;
    }
    renderWizard();
  }
  else if (editMatch) renderEditWizard(decodeURIComponent(editMatch[1]));
  else if (recipeMatch) renderDetail(decodeURIComponent(recipeMatch[1]));
  else renderHome();

  app.focus({ preventScroll: true });
}

function renderLoadingState() {
  app.innerHTML = `
    <div class="empty-state" aria-live="polite">
      <div>
        <h2>Chargement des recettes</h2>
        <p class="muted">On vérifie ta session et on prépare le carnet.</p>
      </div>
    </div>
  `;
}

function renderLoadError(error) {
  app.innerHTML = `
    <div class="empty-state">
      <div>
        <h2>Impossible de charger les recettes</h2>
        <p class="muted">${escapeHtml(error.message || "Réessaie dans quelques instants.")}</p>
        <p><button class="secondary-button" id="retryLoadButton" type="button">Réessayer</button></p>
      </div>
    </div>
  `;

  document.querySelector("#retryLoadButton").addEventListener("click", async () => {
    try {
      await loadData();
      route();
    } catch (retryError) {
      renderLoadError(retryError);
    }
  });
}

async function syncSession(session, options = {}) {
  state.user = session?.user || null;
  await hydrateUserData();
  updateAdminUi();
  if (options.render !== false) route();
}

function queueSessionSync(session) {
  authRefreshQueue = authRefreshQueue
    .catch(() => null)
    .then(() => syncSession(session))
    .catch((error) => {
      console.error(error);
      renderLoadError(error);
    });
}

addRecipeButton?.addEventListener("click", () => {
  if (state.user) {
    startNewRecipe();
  } else {
    requestAuth(() => {
      startNewRecipe();
    });
  }
});

adminStatusButton?.addEventListener("click", async () => {
  if (!state.user) {
    requestAuth(null);
  }
});

signOutButton?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  state.user = null;
  state.profile = null;
  updateAdminUi();
  showToast("Déconnexion réussie.");
  route();
});

toggleAuthModeButton?.addEventListener("click", () => {
  state.authMode = state.authMode === "signin" ? "signup" : "signin";
  adminError.textContent = "";
  authSubmitButton.disabled = false;
  updateAuthDialog();
});

forgotPasswordButton?.addEventListener("click", () => {
  state.authMode = "reset";
  adminError.textContent = "";
  updateAuthDialog();
});

adminForm?.addEventListener("submit", handleAuthSubmit);
closeAdminDialog?.addEventListener("click", () => adminDialog.close());
window.addEventListener("hashchange", route);

supabaseClient.auth.onAuthStateChange((event, session) => {
  if (!hasBootstrapped || event === "INITIAL_SESSION") return;
  window.setTimeout(() => queueSessionSync(session), 0);
});

renderLoadingState();

loadData()
  .then(() => {
    hasBootstrapped = true;
    route();
  })
  .catch((error) => {
    hasBootstrapped = true;
    renderLoadError(error);
  });
