// downloads.js — saves recitations ON THE PHONE so they play without internet.
// Storage: IndexedDB, a database built into the browser.
//   "files" store: key -> the audio itself (a Blob)
//   "meta"  store: key -> { size, savedAt }   (small, so listing is fast)
// A key looks like "258-18" = recitation style 258, surah 18.
// Why not the Cache API? The player seeks by asking for part of a file; a
// saved Blob supports that natively, a cached response does not.

const Downloads = (() => {
  const keyOf = (styleId, n) => styleId + "-" + n;
  const saved = new Map(); // key -> size in bytes
  let job = null;          // the download running right now (only one at a time)
  let wake = null;         // keeps the screen on while downloading

  // ----- small IndexedDB helpers -----
  const db = new Promise((resolve, reject) => {
    const open = indexedDB.open("soufi-audio", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("files"); open.result.createObjectStore("meta"); };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const wrap = (req) => new Promise((ok, fail) => { req.onsuccess = () => ok(req.result); req.onerror = () => fail(req.error); });
  const finished = (tx) => new Promise((ok, fail) => { tx.oncomplete = ok; tx.onerror = tx.onabort = () => fail(tx.error); });
  const openTx = async (names, mode) => (await db).transaction(names, mode);

  // Read what is already saved (runs once at start-up).
  const ready = (async () => {
    try {
      const store = (await openTx("meta", "readonly")).objectStore("meta");
      const [keys, values] = await Promise.all([wrap(store.getAllKeys()), wrap(store.getAll())]);
      keys.forEach((k, i) => saved.set(k, values[i].size));
    } catch (e) { console.error("Saved audio unavailable", e); }
  })();

  async function put(key, blob) {
    const tx = await openTx(["files", "meta"], "readwrite");
    tx.objectStore("files").put(blob, key);
    tx.objectStore("meta").put({ size: blob.size, savedAt: Date.now() }, key);
    await finished(tx);
    saved.set(key, blob.size);
  }

  // Returns a temporary address (blob:...) for a saved surah, or null.
  async function getUrl(styleId, n) {
    try {
      const tx = await openTx("files", "readonly");
      const blob = await wrap(tx.objectStore("files").get(keyOf(styleId, n)));
      return blob ? URL.createObjectURL(blob) : null;
    } catch (e) { return null; }
  }

  // Delete every saved surah of one style.
  async function removeStyle(style) {
    const keys = [...saved.keys()].filter((k) => k.startsWith(style.id + "-"));
    if (!keys.length) return;
    const tx = await openTx(["files", "meta"], "readwrite");
    keys.forEach((k) => { tx.objectStore("files").delete(k); tx.objectStore("meta").delete(k); });
    await finished(tx);
    keys.forEach((k) => saved.delete(k));
  }

  // ----- questions the screens ask -----
  const isSaved = (styleId, n) => saved.has(keyOf(styleId, n));
  const savedCount = (styleId) => [...saved.keys()].filter((k) => k.startsWith(styleId + "-")).length;
  const savedBytes = (styleId) => [...saved].reduce((t, [k, v]) => t + (k.startsWith(styleId + "-") ? v : 0), 0);
  function missing(style) { // surah numbers not saved yet
    const list = [];
    for (let n = 1; n <= style.surahs; n++) if (!isSaved(style.id, n)) list.push(n);
    return list;
  }
  const isComplete = (style) => missing(style).length === 0;

  // ----- file sizes: lets us warn about data use and show true progress -----
  const sizesKey = (style) => "soufi-sizes-" + style.id;
  function knownSizes(style) {
    try {
      const list = JSON.parse(localStorage.getItem(sizesKey(style)));
      return Array.isArray(list) && list.length === SURAHS.length ? list : null;
    } catch (e) { return null; }
  }
  const pending = {};
  // Sizes of all 114 surahs of a style (asks the server with tiny HEAD requests,
  // then remembers the answer). Returns null if the server does not tell us.
  function estimate(style) {
    const cached = knownSizes(style);
    if (cached) return Promise.resolve(cached);
    if (!pending[style.id]) {
      pending[style.id] = (async () => {
        const sizes = new Array(SURAHS.length).fill(0);
        let next = 0;
        const worker = async () => {
          while (next < SURAHS.length) {
            const i = next++;
            try {
              const res = await fetch(surahUrl(style, i + 1), { method: "HEAD" });
              sizes[i] = Number(res.headers.get("content-length")) || 0;
            } catch (e) { sizes[i] = 0; }
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker)); // 6 at a time
        if (!sizes.every((s) => s > 0)) return null;
        try { localStorage.setItem(sizesKey(style), JSON.stringify(sizes)); } catch (e) { /* ignore */ }
        return sizes;
      })().finally(() => { delete pending[style.id]; });
    }
    return pending[style.id];
  }
  async function sizeOf(style, n) { // size of ONE surah
    const cached = knownSizes(style);
    if (cached) return cached[n - 1];
    try {
      const res = await fetch(surahUrl(style, n), { method: "HEAD" });
      return Number(res.headers.get("content-length")) || 0;
    } catch (e) { return 0; }
  }

  // ----- keep the screen awake while downloading (a sleeping phone pauses it) -----
  async function keepAwake() {
    try {
      if (!navigator.wakeLock) return;
      wake = await navigator.wakeLock.request("screen");
      wake.addEventListener("release", () => { wake = null; });
    } catch (e) { /* not allowed: ignore */ }
  }
  const letSleep = () => { if (wake) wake.release().catch(() => {}); wake = null; };
  document.addEventListener("visibilitychange", () => {
    if (job && !wake && document.visibilityState === "visible") keepAwake();
  });

  // ----- downloading ONE surah and saving it -----
  async function fetchSurah(style, n, signal, report) {
    const res = await fetch(surahUrl(style, n), { signal });
    if (!res.ok) throw new Error("The server answered " + res.status + ".");
    const total = Number(res.headers.get("content-length")) || 0;

    if (total && navigator.storage && navigator.storage.estimate) { // enough room?
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      if (quota && quota - usage < total * 1.2) throw new Error("Not enough free space on this phone.");
    }

    // Read piece by piece to show progress. Every ~8 MB the pieces are packed
    // into a Blob, which the browser can keep on disk instead of in memory.
    const reader = res.body.getReader();
    const parts = [];
    let pieces = [], pieceBytes = 0, received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pieces.push(value); pieceBytes += value.length; received += value.length;
      if (pieceBytes > 8 * 1024 * 1024) { parts.push(new Blob(pieces)); pieces = []; pieceBytes = 0; }
      report(received, total);
    }
    if (pieces.length) parts.push(new Blob(pieces));
    if (total && received < total) throw new Error("The download was cut short.");
    await put(keyOf(style.id, n), new Blob(parts, { type: "audio/mpeg" })); // saved only when COMPLETE
  }

  function friendly(e) {
    if (e.name === "TypeError" || e.message === "Failed to fetch")
      return navigator.onLine ? "The download was blocked or interrupted." : "No internet connection.";
    return e.message;
  }

  // ----- downloading a list of surahs, one after another -----
  // onProgress({ finished, count, ratio }) is called as bytes arrive.
  // Returns { status: "done" | "cancelled" | "error", message }.
  async function run(style, numbers, onProgress) {
    if (job) return { status: "error", message: "Another download is running." };
    job = { controller: new AbortController() };
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); // ask the browser to keep our files
    keepAwake();
    try {
      const sizes = numbers.length > 1 ? await estimate(style) : null;
      const totalBytes = sizes ? numbers.reduce((t, n) => t + sizes[n - 1], 0) : 0;
      let doneBytes = 0, lastTick = -1;
      for (let i = 0; i < numbers.length; i++) {
        const n = numbers[i];
        const report = (received, total) => {
          const ratio = totalBytes ? (doneBytes + received) / totalBytes
                                   : (i + (total ? received / total : 0)) / numbers.length;
          const tick = Math.floor(ratio * 1000); // update the screen at most every 0.1%
          if (tick !== lastTick) { lastTick = tick; onProgress({ finished: i, count: numbers.length, ratio: Math.min(ratio, 1) }); }
        };
        report(0, 0);
        await fetchSurah(style, n, job.controller.signal, report);
        doneBytes += sizes ? sizes[n - 1] : 0;
      }
      onProgress({ finished: numbers.length, count: numbers.length, ratio: 1 });
      return { status: "done" };
    } catch (e) {
      if (e.name === "AbortError") return { status: "cancelled" };
      console.error("Download failed", e);
      return { status: "error", message: friendly(e) };
    } finally {
      job = null;
      letSleep();
    }
  }
  const cancel = () => { if (job) job.controller.abort(); };

  return { ready, getUrl, removeStyle, isSaved, savedCount, savedBytes, missing, isComplete, estimate, sizeOf, run, cancel };
})();
