const CACHE = "bitpos-v5";
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

  if (url.pathname.includes("/api/")) return;

  const isShell = SHELL.includes(url.pathname);
  if (!isShell) return;

  // Network-first: always try the network so a fresh index.html (with updated
  // asset hashes) is served after every deployment. Only fall back to the
  // cache when the network is unavailable (offline support).
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
