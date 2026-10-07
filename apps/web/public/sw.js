const CACHE_PREFIX = "hero-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const SHELL_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheSuccessfulResponse(request, response) {
  if (!response || !response.ok || response.type !== "basic") {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return cacheSuccessfulResponse(request, response);
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match("/")) ||
      (await caches.match("/offline.html"))
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => cacheSuccessfulResponse(request, response))
    .catch(() => null);

  if (cached) {
    void network;
    return cached;
  }

  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const cacheableDestination = new Set([
    "script",
    "style",
    "image",
    "font",
    "audio",
  ]);

  if (
    cacheableDestination.has(request.destination) ||
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/audio/")
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
