// app.js — what the app DOES.
// It has two screens (home and surah list) and a tiny "router" that decides
// which one to show, based on the end of the web address (the #part).
//   .../soufi-app/          -> home
//   .../soufi-app/#/s/258   -> surah list for the style with id 258
// Because each screen has its own address, the Android back button works.

const homeEl = document.getElementById("home");
const surahsEl = document.getElementById("surahs");
const playerEl = document.getElementById("player");
let listStyle = null; // the style whose surah list is open
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
  // A fully saved style opens at once; otherwise the offline pop-up appears first.
  card.addEventListener("click", () => Downloads.ready.then(() => {
    if (Downloads.isComplete(style)) location.hash = "#/s/" + style.id;
    else Dialog.askStyle(style);
  }));
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
      <button class="row${i + 1 === playingNumber(style) ? " now" : ""}${Downloads.isSaved(style.id, i + 1) ? " saved" : ""}" type="button" data-i="${i}">
        <span class="num">${i + 1}</span>
        <span class="row-en">${en}</span>
        <span class="row-ar" lang="ar">${ar}</span>
      </button>
    </li>`).join("");
  paintSavedInfo(style);
  searchEl.value = "";
  emptyEl.hidden = true;
}

// One tap handler for the whole list (cheaper than 114 separate ones).
surahListEl.addEventListener("click", (event) => {
  const row = event.target.closest(".row");
  if (!row) return;
  const n = Number(row.dataset.i) + 1;
  // Saved surahs (or a fully saved style) play at once; any other surah
  // shows the same pop-up as the recitation styles.
  if (Downloads.isSaved(listStyle.id, n) || Downloads.isComplete(listStyle)) playSurah(listStyle, n);
  else Dialog.askSurah(listStyle, n);
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
const screens = { home: homeEl, surahs: surahsEl, player: playerEl };
const findStyle = (id) => STYLES.find((s) => s.id === Number(id));

function show(name) { // show one screen, hide the others
  Object.entries(screens).forEach(([key, node]) => { node.hidden = key !== name; });
  window.scrollTo(0, 0);
}

function route() {
  const list = location.hash.match(/^#\/s\/(\d+)$/);        // #/s/258
  const play = location.hash.match(/^#\/p\/(\d+)\/(\d+)$/);   // #/p/258/18
  if (list && findStyle(list[1])) {
    listStyle = findStyle(list[1]);
    renderSurahs(listStyle);
    show("surahs");
    // jump to the surah that is playing, if there is one
    const now = document.querySelector(".row.now");
    if (now) now.scrollIntoView({ block: "center" });
  } else if (play && findStyle(play[1]) && play[2] >= 1 && play[2] <= SURAHS.length) {
    listStyle = findStyle(play[1]);
    openPlayer(listStyle, Number(play[2]));
    show("player");
  } else {
    show("home");
  }
}
window.addEventListener("hashchange", route);

// ---------- Start ----------
document.getElementById("reciter-ar").textContent = RECITER.arabic;
document.getElementById("reciter-en").textContent = RECITER.english;
STYLES.forEach((style, i) => listEl.appendChild(makeCard(style, i)));
route();

// ---------- Saved-offline summary under the search box ----------
function paintSavedInfo(style) {
  const count = Downloads.savedCount(style.id);
  document.getElementById("saved-info").hidden = count === 0;
  document.getElementById("saved-text").textContent =
    `${count} of ${style.surahs} saved on this phone (${Math.round(Downloads.savedBytes(style.id) / 1048576)} MB)`;
}

document.getElementById("saved-remove").addEventListener("click", () => {
  if (confirm(`Remove the saved ${listStyle.english} recitations from this phone?`)) {
    Downloads.removeStyle(listStyle).then(() => renderSurahs(listStyle));
  }
});

// If the list opened before the saved files were read, redraw it once they are.
Downloads.ready.then(() => { if (!surahsEl.hidden && listStyle) renderSurahs(listStyle); });

// ---------- Make the app installable and work offline ----------
if ("serviceWorker" in navigator) {
  // When a NEW version of the app takes over, reload once so you see it,
  // but only if nothing is playing and no pop-up is open.
  const hadHelper = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    const idle = audio.paused && !document.getElementById("dl-dialog").open;
    if (hadHelper && idle) location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.error("Service worker failed", e));
  });
}
