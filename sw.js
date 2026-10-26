// sw.js — the SERVICE WORKER: a helper script the browser runs in the background.
// It keeps a copy of the app's own files on the phone, so the app opens and
// works with no internet. (Audio is NOT handled here; downloads.js does that.)
// When you ADD or RENAME a file, add it to FILES and change VERSION.

const VERSION = "2";
const CACHE = "soufi-shell-" + VERSION;
const FILES = [
  "./", "index.html", "style.css", "data.js", "surahs.js", "downloads.js", "dialogs.js",
  "player.js", "app.js", "manifest.json",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png",
];

// 1. Install: save every app file in the cache.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))) // "reload" = skip old browser copies
  );
  self.skipWaiting();
});

// 2. Activate: delete caches left by older versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((n) => n.startsWith("soufi-shell-") && n !== CACHE)
        .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// 3. Fetch: answer from the cache first (instant, works offline), and quietly
//    fetch a fresh copy in the background for next time.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return; // other sites (audio) pass straight through
  event.respondWith(serve(event, req));
});

async function serve(event, req) {
  const cache = await caches.open(CACHE);
  const cached = (await cache.match(req, { ignoreSearch: true })) ||
    (req.mode === "navigate" ? await cache.match("index.html") : undefined);
  const refresh = fetch(req, { cache: "no-cache" }).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (cached) { event.waitUntil(refresh.catch(() => {})); return cached; }
  return refresh;
}
