const state = { items: [], filter: "all", query: "", category: "all", toastTimer: null };

const itemGrid = document.querySelector("#item-grid");
const emptyState = document.querySelector("#empty-state");
const loadError = document.querySelector("#load-error");
const postDialog = document.querySelector("#post-dialog");
const matchDialog = document.querySelector("#match-dialog");
const postForm = document.querySelector("#post-form");
const formError = document.querySelector("#form-error");
const matchResults = document.querySelector("#match-results");
const toast = document.querySelector("#toast");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatDate(value) {
  if (!value) return "Date not listed";
  const parsed = new Date(value + "T12:00:00");
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(parsed);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

async function loadItems() {
  loadError.hidden = true;
  try {
    const [itemData, status] = await Promise.all([request("/api/items"), request("/api/status")]);
    state.items = itemData.items || [];
    document.querySelector("#active-count").textContent =
      String(status.active_count ?? state.items.length).padStart(2, "0");
    updateAiBadge(status);
    renderItems();
  } catch (error) {
    loadError.textContent = error.message + " Start the app with python app.py and refresh this page.";
    loadError.hidden = false;
  }
}

function updateAiBadge(status) {
  const badge = document.querySelector("#ai-status");
  badge.classList.toggle("is-ai", Boolean(status.ai_enabled));
  badge.classList.toggle("is-local", !status.ai_enabled);
  badge.querySelector(".status-label").textContent = status.ai_enabled
    ? "Gemini matching · " + status.model
    : "Local matching ready";
}

function visibleItems() {
  const query = state.query.trim().toLocaleLowerCase();
  return state.items.filter((item) => {
    if (state.filter !== "all" && item.kind !== state.filter) return false;
    if (state.category !== "all" && item.category !== state.category) return false;
    if (!query) return true;
    const searchable = [item.name, item.category, item.color, item.description, item.location]
      .join(" ").toLocaleLowerCase();
    return searchable.includes(query);
  });
}

function renderItems() {
  const items = visibleItems();
  itemGrid.innerHTML = items.map((item) => {
    const isLost = item.kind === "lost";
    const kindLabel = isLost ? "Lost" : "Found";
    const color = item.color ? " · " + escapeHtml(item.color) : "";
    const sample = item.is_demo ? '<span class="demo-label">SAMPLE</span>' : "";
    return '<article class="item-card">' +
      '<div class="card-topline"><span class="kind-badge ' + (isLost ? "lost" : "found") + '">' + kindLabel + "</span>" + sample + "</div>" +
      "<h3>" + escapeHtml(item.name) + "</h3>" +
      '<span class="card-category">' + escapeHtml(item.category) + color + "</span>" +
      '<p class="card-description">' + escapeHtml(item.description) + "</p>" +
      '<div class="card-meta">' +
        '<span><b class="meta-icon" aria-hidden="true">⌖</b>' + escapeHtml(item.location) + "</span>" +
        '<span><b class="meta-icon" aria-hidden="true">◷</b>' + escapeHtml(formatDate(item.item_date)) + "</span>" +
      "</div>" +
      '<div class="card-actions">' +
        '<button class="match-button" data-action="find-matches" data-id="' + item.id + '"><span aria-hidden="true">⌕</span> Find possible matches</button>' +
        '<button class="resolve-button" data-action="resolve-item" data-id="' + item.id + '" title="Mark this listing as reunited">Reunited ✓</button>' +
      "</div></article>";
  }).join("");
  emptyState.hidden = items.length > 0;
}

function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderItems();
}

function openPostDialog() {
  formError.hidden = true;
  postForm.reset();
  const now = new Date();
  postForm.elements.item_date.value =
    new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  postDialog.showModal();
}

function showMatchLoading(item) {
  document.querySelector("#match-title").textContent = "Matching " + item.name;
  document.querySelector("#match-subtitle").textContent = "Looking for shared clues across the opposite board.";
  document.querySelector("#match-footer").hidden = true;
  matchResults.innerHTML = '<div class="match-loading"><div><div class="spinner"></div><span>Comparing descriptions, colors, dates, and locations…</span></div></div>';
  matchDialog.showModal();
}

function renderMatches(data) {
  const matches = data.matches || [];
  document.querySelector("#match-subtitle").textContent = matches.length
    ? matches.length + (matches.length === 1 ? " possible lead" : " possible leads") + " to review"
    : "Try adding another identifying detail or check back later.";
  const results = matches.map((entry) => {
    const score = Math.max(0, Math.min(100, Number(entry.score) || 0));
    const label = score >= 75 ? "Strong lead" : score >= 50 ? "Worth checking" : "Possible lead";
    const item = entry.item;
    const color = item.color ? " · " + escapeHtml(item.color) : "";
    const chips = (entry.evidence || []).map((line) =>
      '<span class="evidence-chip">' + escapeHtml(line) + "</span>"
    ).join("");
    return '<article class="match-result">' +
      '<div class="match-result-top"><div>' +
        '<span class="kind-badge ' + (item.kind === "lost" ? "lost" : "found") + '">' + escapeHtml(item.kind) + "</span>" +
        "<h3>" + escapeHtml(item.name) + "</h3>" +
        '<div class="match-result-meta">' + escapeHtml(item.category) + color + " · " +
          escapeHtml(item.location) + " · " + escapeHtml(formatDate(item.item_date)) + "</div>" +
      '</div><div class="score-box" aria-label="' + score + ' percent description match">' +
        '<span class="score-number">' + score + '%</span><span class="score-label">' + label + "</span>" +
        '<progress class="score-track" max="100" value="' + score + '" aria-hidden="true"></progress>' +
      "</div></div>" +
      '<p class="match-reason">' + escapeHtml(entry.reason || "Review the listing and confirm privately.") + "</p>" +
      '<div class="match-evidence">' + chips + "</div></article>";
  }).join("");
  const noMatches = '<div class="no-match"><strong>No close leads yet</strong><span>Try a more specific description, or leave the report up for a while.</span></div>';
  let modeLine = "Local description matching · works offline";
  if (data.mode === "gemini") modeLine = "AI-assisted ranking · " + escapeHtml(data.model || "Gemini");
  if (data.note) modeLine = escapeHtml(data.note) + " Local matching is shown.";
  matchResults.innerHTML = (results || noMatches) + '<p class="match-mode">' + modeLine + "</p>";
  document.querySelector("#match-footer").hidden = matches.length === 0;
}

async function findMatches(id) {
  const item = state.items.find((entry) => Number(entry.id) === Number(id));
  if (!item) return;
  showMatchLoading(item);
  try {
    const data = await request("/api/matches", {
      method: "POST",
      body: JSON.stringify({ item_id: item.id }),
    });
    renderMatches(data);
  } catch (error) {
    matchResults.innerHTML = '<div class="no-match"><strong>Could not compare reports</strong><span>' +
      escapeHtml(error.message) + "</span></div>";
  }
}

async function submitItem(event) {
  event.preventDefault();
  formError.hidden = true;
  const submitButton = document.querySelector("#submit-item");
  submitButton.disabled = true;
  submitButton.textContent = "Posting…";
  const payload = Object.fromEntries(new FormData(postForm).entries());
  try {
    await request("/api/items", { method: "POST", body: JSON.stringify(payload) });
    postDialog.close();
    await loadItems();
    showToast("Your report is on the board.");
  } catch (error) {
    formError.textContent = error.message;
    formError.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Post report <span aria-hidden="true">↗</span>';
  }
}

async function resolveItem(id) {
  const item = state.items.find((entry) => Number(entry.id) === Number(id));
  if (!item) return;
  const label = item.kind === "lost" ? "This item has been reunited" : "This item has been claimed";
  if (!window.confirm(label + "? The listing will leave the active board.")) return;
  try {
    await request("/api/items/" + id + "/resolve", { method: "POST", body: "{}" });
    await loadItems();
    showToast("Marked as reunited. Thanks for helping!");
  } catch (error) {
    showToast(error.message);
  }
}

async function resetDemo() {
  if (!window.confirm("Restore the sample listings? Your own reports will stay on the board.")) return;
  try {
    await request("/api/demo/reset", { method: "POST", body: "{}" });
    await loadItems();
    showToast("Sample listings restored.");
  } catch (error) {
    showToast(error.message);
  }
}

document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    const { action, id } = actionButton.dataset;
    if (action === "open-post") openPostDialog();
    if (action === "close-post") postDialog.close();
    if (action === "close-matches") matchDialog.close();
    if (action === "scroll-board") document.querySelector("#board").scrollIntoView({ behavior: "smooth" });
    if (action === "find-matches") findMatches(id);
    if (action === "resolve-item") resolveItem(id);
    if (action === "reset-demo") resetDemo();
    return;
  }
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) setFilter(filterButton.dataset.filter);
});

document.querySelector("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderItems();
});
document.querySelector("#category-filter").addEventListener("change", (event) => {
  state.category = event.target.value;
  renderItems();
});
postForm.addEventListener("submit", submitItem);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
  if (event.key === "Escape" && !postDialog.open && matchDialog.open) matchDialog.close();
});
loadItems();
