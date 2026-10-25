// player.js — the AUDIO engine and the player screen.
// There is ONE <audio> object for the whole life of the app, so the recitation
// keeps playing when you go back to the list or switch to another app.

const $ = (id) => document.getElementById(id);
const audio = new Audio();
audio.preload = "none"; // download nothing until you press play (saves your data)

let nowStyle = null;  // which recitation style is loaded
let nowNum = 0;       // which surah number is loaded
let dragging = false; // true while your finger is on the seek bar

const el = {
  back: $("player-back"), style: $("p-style"), art: $("art"), num: $("p-num"),
  ar: $("p-ar"), en: $("p-en"), status: $("p-status"),
  seek: $("seek"), cur: $("t-cur"), dur: $("t-dur"),
  prev: $("btn-prev"), back10: $("btn-back10"), play: $("btn-play"),
  fwd10: $("btn-fwd10"), next: $("btn-next"),
};

// ---------- small helpers ----------
// 75 seconds -> "1:15",  3725 seconds -> "1:02:05"
function fmt(s) {
  if (!isFinite(s)) return "--:--";
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
}
const setStatus = (text) => { el.status.textContent = text; };
const setFill = (ratio) => el.seek.style.setProperty("--p", ratio * 100 + "%"); // gold part of the bar

// The audio address = style folder + 3-digit surah number + ".mp3"
// Example: https://cdn.mp3quran.net/audio/abdulrasheed-sufi/r3/018.mp3
const surahUrl = (style, n) => style.server + String(n).padStart(3, "0") + ".mp3";

// ---------- keep the screen in step with the audio ----------
function syncTime() {
  const d = audio.duration;
  const ratio = isFinite(d) && d > 0 ? audio.currentTime / d : 0;
  if (!dragging) {
    el.seek.value = ratio * 1000;
    setFill(ratio);
    el.cur.textContent = fmt(audio.currentTime);
  }
  el.dur.textContent = fmt(d);
}

function syncPlayState() {
  const playing = !audio.paused;
  el.play.dataset.state = playing ? "playing" : "paused";
  el.play.setAttribute("aria-label", playing ? "Pause" : "Play");
  el.art.classList.toggle("playing", playing);
}

function render() {
  if (!nowStyle) return;
  const [ar, en] = SURAHS[nowNum - 1];
  el.style.textContent = nowStyle.english;
  el.num.textContent = nowNum;
  el.ar.textContent = ar;
  el.en.textContent = en;
  el.back.href = "#/s/" + nowStyle.id;
  el.prev.disabled = nowNum <= 1;
  el.next.disabled = nowNum >= SURAHS.length;
  syncPlayState();
  syncTime();
}

// ---------- loading and playing ----------
function loadSurah(style, n, autoplay) {
  const same = nowStyle && nowStyle.id === style.id && nowNum === n;
  if (!same) {
    nowStyle = style; nowNum = n;
    audio.src = surahUrl(style, n);
    el.seek.value = 0; setFill(0);
    el.cur.textContent = "0:00"; el.dur.textContent = "--:--";
    setStatus(autoplay ? "Loading…" : "");
    updateLockScreen();
  }
  if (autoplay && (!same || audio.paused)) audio.play().catch(() => {}); // errors are shown by the "error" event below
  render();
}

// Called when you tap a surah in the list.
function playSurah(style, n) {
  loadSurah(style, n, true);
  location.hash = "#/p/" + style.id + "/" + n;
}

// Called by the router when the address is #/p/... (also after a page refresh).
function openPlayer(style, n) { loadSurah(style, n, false); render(); }

// Which surah of this style is loaded? (0 = none). The list uses it to highlight the row.
const playingNumber = (style) => (nowStyle && nowStyle.id === style.id ? nowNum : 0);

function goTo(n) { // previous / next surah
  if (!nowStyle || n < 1 || n > SURAHS.length) return;
  loadSurah(nowStyle, n, true);
  // replace (not add) so the back button still returns to the list
  if (location.hash.startsWith("#/p/")) location.replace("#/p/" + nowStyle.id + "/" + n);
}

function skip(seconds) {
  if (!isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
}

// ---------- buttons ----------
el.play.addEventListener("click", () => {
  if (!nowStyle) return;
  if (!audio.paused) { audio.pause(); return; }
  if (audio.error) audio.load(); // try again after a network problem
  setStatus("Loading…");
  audio.play().catch(() => {});
});
el.prev.addEventListener("click", () => goTo(nowNum - 1));
el.next.addEventListener("click", () => goTo(nowNum + 1));
el.back10.addEventListener("click", () => skip(-10));
el.fwd10.addEventListener("click", () => skip(10));

// Seek bar: while dragging, only preview the time; apply it when you let go.
el.seek.addEventListener("input", () => {
  dragging = true;
  const ratio = el.seek.value / 1000;
  setFill(ratio);
  if (isFinite(audio.duration)) el.cur.textContent = fmt(ratio * audio.duration);
});
el.seek.addEventListener("change", () => {
  if (isFinite(audio.duration)) audio.currentTime = (el.seek.value / 1000) * audio.duration;
  dragging = false;
});

// ---------- things the audio tells us ----------
audio.addEventListener("play", syncPlayState);
audio.addEventListener("pause", syncPlayState);
audio.addEventListener("waiting", () => setStatus("Loading…"));
audio.addEventListener("playing", () => setStatus(""));
audio.addEventListener("durationchange", syncTime);
audio.addEventListener("timeupdate", () => { syncTime(); updatePosition(); });
audio.addEventListener("ended", () => {
  if (nowNum < SURAHS.length) goTo(nowNum + 1); // keep going to the next surah
  else setStatus("The recitation has finished.");
});
audio.addEventListener("error", () =>
  setStatus("Could not load this recitation. Check your internet, then tap play."));

// ---------- phone lock screen and notification controls ----------
const session = navigator.mediaSession;

function updateLockScreen() {
  if (!session || !nowStyle) return;
  const [ar, en] = SURAHS[nowNum - 1];
  session.metadata = new MediaMetadata({
    title: nowNum + ". " + en + " – " + ar,
    artist: RECITER.english,
    album: nowStyle.english,
  });
}

function updatePosition() {
  if (!session || !isFinite(audio.duration) || audio.duration <= 0) return;
  try {
    session.setPositionState({ duration: audio.duration, position: audio.currentTime, playbackRate: 1 });
  } catch (e) { /* not supported: ignore */ }
}

function onAction(name, handler) {
  try { session.setActionHandler(name, handler); } catch (e) { /* not supported: ignore */ }
}
if (session) {
  onAction("play", () => audio.play());
  onAction("pause", () => audio.pause());
  onAction("previoustrack", () => goTo(nowNum - 1));
  onAction("nexttrack", () => goTo(nowNum + 1));
  onAction("seekbackward", () => skip(-10));
  onAction("seekforward", () => skip(10));
  onAction("seekto", (d) => { audio.currentTime = d.seekTime; });
}
