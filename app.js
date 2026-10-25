// app.js — what the app DOES.
// It has two screens (home and surah list) and a tiny "router" that decides
// which one to show, based on the end of the web address (the #part).
//   .../soufi-app/          -> home
//   .../soufi-app/#/s/258   -> surah list for the style with id 258
// Because each screen has its own address, the Android back button works.

const homeEl = document.getElementById("home");
const surahsEl = document.getElementById("surahs");
const listEl = document.getElementById("styles");
const surahListEl = document.getElementById("surah-list");
const searchEl = document.getElementById("search");
const emptyEl = document.getElementById("empty");
const toastEl = document.getElementById("toast");
let toastTimer;

// Show a short message at the bottom for 2.5 seconds.
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

// ---------- Screen 1: one card per recitation style ----------
function makeCard(style, index) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.style.setProperty("--i", index);
  card.setAttribute("aria-label", `${style.english}, ${style.type}, ${style.surahs} surahs`);
  card.innerHTML = `
    ${style.badge ? `<span class="badge">${style.badge}</span>` : ""}
    <span class="card-ar" lang="ar">${style.arabic}</span>
    <span class="card-en">${style.english}</span>
    <span class="card-meta">${style.type}, ${style.surahs} surahs</span>
  `;
  // Changing the address is what "opens" the next screen.
  card.addEventListener("click", () => { location.hash = "#/s/" + style.id; });
  return card;
}

// ---------- Screen 2: the surah list ----------
// Make a simple version of a name for searching: "Al-Ma’idah" -> "almaidah".
const simple = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

function renderSurahs(style) {
  document.getElementById("style-ar").textContent = style.arabic;
  document.getElementById("style-en").textContent = style.english;
  surahListEl.innerHTML = SURAHS.map(([ar, en], i) => `
    <li data-num="${i + 1}" data-key="${simple(en)}" data-ar="${ar}">
      <button class="row" type="button" data-i="${i}">
        <span class="num">${i + 1}</span>
        <span class="row-en">${en}</span>
        <span class="row-ar" lang="ar">${ar}</span>
      </button>
    </li>`).join("");
  searchEl.value = "";
  emptyEl.hidden = true;
}

// One tap handler for the whole list (cheaper than 114 separate ones).
surahListEl.addEventListener("click", (event) => {
  const row = event.target.closest(".row");
  if (!row) return;
  const [, en] = SURAHS[row.dataset.i];
  showToast(`${en}: the player comes in the next step.`);
});

// Search: hide the rows that do not match what you typed.
searchEl.addEventListener("input", () => {
  const typed = searchEl.value.trim();
  const q = simple(typed);
  let shown = 0;
  surahListEl.querySelectorAll("li").forEach((li) => {
    const match = !typed ||
      (/^\d+$/.test(typed) ? li.dataset.num === String(Number(typed))
                           : (q !== "" && li.dataset.key.includes(q)) || li.dataset.ar.includes(typed));
    li.hidden = !match;
    if (match) shown++;
  });
  emptyEl.hidden = shown > 0;
});

// ---------- The router ----------
function route() {
  const found = location.hash.match(/^#\/s\/(\d+)$/);
  const style = found && STYLES.find((s) => s.id === Number(found[1]));
  homeEl.hidden = Boolean(style);
  surahsEl.hidden = !style;
  if (style) renderSurahs(style);
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ---------- Start ----------
document.getElementById("reciter-ar").textContent = RECITER.arabic;
document.getElementById("reciter-en").textContent = RECITER.english;
STYLES.forEach((style, i) => listEl.appendChild(makeCard(style, i)));
route();
