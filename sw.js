const CACHE_NAME = "sonic-loom-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/audio-engine.js",
  "./js/track.js",
  "./js/tape-worklet.js",
  "./js/granular.js",
  "./js/effects.js",
  "./js/scenes.js",
  "./js/ui-knob.js",
  "./js/samples.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png"
  // Sample files aren't precached here on purpose — the list changes over
  // time, and cache.addAll fails installation entirely if any one entry
  // 404s. They're still cached for offline use the first time each is
  // actually loaded, via the asset branch of the fetch handler below.
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isStaticAsset = url.pathname.includes("/assets/");

  if (isStaticAsset) {
    // Icons and samples rarely change once added — cache-first is fine,
    // and saves re-downloading several MB of samples on every load.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  } else {
    // App shell (HTML/JS/CSS) changes often — always prefer the network so
    // updates show up on the next reload, falling back to cache offline.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
