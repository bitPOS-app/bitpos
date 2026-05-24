const CACHE = "bitpos-v4";
const SHELL = ["/app/", "/app/index.html", "/app/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Always bypass SW for API calls
  if (url.pathname.includes("/api/")) return;

  // Only serve from cache for exact shell URLs - everything else (JS, CSS,
  // fonts, images) goes to the network so dev-mode HMR updates are never
  // blocked by a stale cached response.
  const isShell = SHELL.includes(url.pathname);
  if (!isShell) return;

  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
