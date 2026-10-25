// app.js — what the app DOES. It reads STYLES (from data.js)
// and builds one tappable card for each recitation style.

const listEl = document.getElementById("styles");
const toastEl = document.getElementById("toast");
let toastTimer;

// Show a short message at the bottom of the screen for 2.5 seconds.
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

// Build one card from one style object.
function makeCard(style, index) {
  const card = document.createElement("button"); // a real button: works with touch, keyboard and screen readers
  card.type = "button";
  card.className = "card";
  card.style.setProperty("--i", index); // used by the CSS to stagger the entrance
  card.setAttribute("aria-label", `${style.english}, ${style.type}, ${style.surahs} surahs`);

  card.innerHTML = `
    ${style.badge ? `<span class="badge">${style.badge}</span>` : ""}
    <span class="card-ar" lang="ar">${style.arabic}</span>
    <span class="card-en">${style.english}</span>
    <span class="card-meta">${style.type}, ${style.surahs} surahs</span>
  `;

  card.addEventListener("click", () => chooseStyle(style, card));
  return card;
}

// Runs when you tap a card. In Step 2 this will open the surah list.
function chooseStyle(style, card) {
  document.querySelectorAll(".card").forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");
  showToast(`${style.english} chosen. The surah list comes in the next step.`);
}

// Fill the screen: header text first, then the cards.
document.getElementById("reciter-ar").textContent = RECITER.arabic;
document.getElementById("reciter-en").textContent = RECITER.english;
STYLES.forEach((style, i) => listEl.appendChild(makeCard(style, i)));
