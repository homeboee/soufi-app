// dialogs.js — the pop-up that offers to save recitations for offline listening.
// It opens by itself when you tap a recitation style, or a surah that is not
// saved yet. No extra button is needed on the screen.

const Dialog = (() => {
  const get = (id) => document.getElementById(id);
  const dlg = get("dl-dialog"), titleEl = get("dl-title"), subEl = get("dl-sub");
  const textEl = get("dl-text"), sizeEl = get("dl-size"), meter = get("dl-meter");
  const fill = get("dl-fill"), statusEl = get("dl-status");
  const go = get("dl-go"), no = get("dl-no");

  // What the pop-up is about: { style, single (a surah number, or null for the
  // whole style), numbers (surahs to download), phase }
  let ctx = null;

  const mb = (bytes) => (bytes >= 1048576 ? Math.round(bytes / 1048576) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB");

  function setBar(ratio) {
    fill.style.width = ratio * 100 + "%";
    meter.setAttribute("aria-valuenow", Math.round(ratio * 100));
  }

  // The pop-up has 4 phases: ask -> downloading -> done (or error). Each phase
  // shows different parts, so one function sets everything for a phase.
  function render(phase, text, goLabel, noLabel) {
    ctx.phase = phase;
    textEl.textContent = text;
    sizeEl.hidden = phase !== "ask";
    meter.hidden = statusEl.hidden = phase !== "downloading";
    go.hidden = phase === "downloading";
    no.hidden = phase === "done";
    go.textContent = goLabel || "";
    no.textContent = noLabel || "Cancel";
  }

  function close() { dlg.close(); ctx = null; }

  // Go where the person was heading: play the surah, or open the surah list.
  function leave(style, single) {
    if (single) playSurah(style, single);
    else location.hash = "#/s/" + style.id;
  }

  function open(style, single) {
    if (dlg.open) return; // ignore a second quick tap
    const missing = Downloads.missing(style);
    ctx = { style, single, numbers: single ? [single] : missing };
    const have = style.surahs - missing.length;
    titleEl.textContent = single ? SURAHS[single - 1][1] : style.english;
    subEl.textContent = single ? style.english : style.arabic;
    subEl.lang = single ? "en" : "ar";
    render("ask",
      single ? "Save this surah on this phone to listen without internet."
        : have ? `${have} of ${style.surahs} surahs are already saved. Download the remaining ${missing.length}?`
        : `Save all ${style.surahs} surahs on this phone to listen without internet.`,
      have ? "Download remaining" : "Download", "Cancel");
    setBar(0);
    sizeEl.textContent = "Checking size…";
    dlg.showModal();

    // Find out how big it is (in the background) and show it.
    const mine = ctx;
    const bytes = single ? Downloads.sizeOf(style, single)
      : Downloads.estimate(style).then((sizes) => (sizes ? missing.reduce((t, n) => t + sizes[n - 1], 0) : 0));
    Promise.resolve(bytes).then((b) => {
      if (ctx !== mine || ctx.phase !== "ask") return;
      sizeEl.textContent = b ? `About ${mb(b)}. This uses your mobile data.` : "This can use a lot of mobile data.";
    });
  }

  async function begin() {
    const { style, single, numbers } = ctx;
    render("downloading", "Keep this screen open while downloading.", "", "Cancel");
    setBar(0);
    statusEl.textContent = "Preparing…";

    const result = await Downloads.run(style, numbers, ({ finished, count, ratio }) => {
      setBar(ratio);
      const pct = Math.floor(ratio * 100) + "%";
      statusEl.textContent = single ? pct : `Surah ${Math.min(finished + 1, count)} of ${count} · ${pct}`;
    });

    if (!ctx) return;
    if (result.status === "done") {
      if (single) { close(); leave(style, single); return; } // play it now, from the saved copy
      render("done", `All ${style.surahs} surahs are saved. They now play without internet.`, "Continue", "");
    } else if (result.status === "cancelled") {
      close();
      showToast(`Stopped. ${Downloads.savedCount(style.id)} of ${style.surahs} saved.`);
      leave(style, single);
    } else {
      render("error", `${result.message} ${Downloads.savedCount(style.id)} of ${style.surahs} saved.`, "Try again", "Cancel");
    }
  }

  function onGo() {
    if (!ctx) return;
    if (ctx.phase === "done") { const { style, single } = ctx; close(); leave(style, single); }
    else begin();
  }

  function onCancel() {
    if (!ctx) return;
    if (ctx.phase === "downloading") { Downloads.cancel(); return; } // begin() then finishes up
    const { style, single } = ctx;
    close();
    leave(style, single); // streaming from the internet
  }

  go.addEventListener("click", onGo);
  no.addEventListener("click", onCancel);
  dlg.addEventListener("cancel", (event) => { event.preventDefault(); onCancel(); }); // phone Back button
  dlg.addEventListener("close", () => { // closed some other way: stop any download
    if (ctx && ctx.phase === "downloading") Downloads.cancel();
    else ctx = null;
  });

  return { askStyle: (style) => open(style, null), askSurah: (style, n) => open(style, n) };
})();
