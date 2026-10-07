const CACHE_PREFIX = "hero-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const SHELL_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
];

async function addIfAvailable(cache, url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // Optional shell asset: offline fallback still works without it.
  }
}

function extractBuildAssets(html) {
  const matches = html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)["']/g);
  return [...new Set(Array.from(matches, (match) => match[1]))];
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);

  const shellResponse = await fetch("/", { cache: "no-store" });
  if (!shellResponse.ok) {
    throw new Error("hero_shell_fetch_failed");
  }

  const html = await shellResponse.clone().text();
  await cache.put("/", shellResponse);

  const buildAssets = extractBuildAssets(html);
  await Promise.all([
    ...SHELL_URLS.map((url) => addIfAvailable(cache, url)),
    ...buildAssets.map((url) => addIfAvailable(cache, url)),
  ]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    precacheAppShell().then(() => self.skipWaiting()),
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

  // Never cache Supabase/Kakao/other external API traffic.
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
