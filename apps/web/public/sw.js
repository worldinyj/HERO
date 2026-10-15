const CACHE_PREFIX = "hero-pwa-";
const CACHE_NAME = CACHE_PREFIX + "v2";
const SHELL_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/pwa-icon.svg",
];

function hasExpectedAssetType(request, response) {
  const path = new URL(typeof request === "string" ? request : request.url, self.location.origin).pathname;
  const destination = typeof request === "string" ? "" : request.destination;
  const mime = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (destination === "script" || /\.m?js$/.test(path)) {
    return /^(?:text|application)\/(?:javascript|ecmascript)$/.test(mime);
  }
  if (destination === "style" || /\.css$/.test(path)) return mime === "text/css";
  return true;
}

async function addIfAvailable(cache, url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok && hasExpectedAssetType(url, response)) {
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

  // SPA fallbacks may return HTTP 200 HTML for a missing JS/CSS asset.
  // Never save that response under the asset URL or serve it as executable code.
  if (!hasExpectedAssetType(request, response)) return Response.error();

  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    // Storage is optional: quota/private-mode failures must not lose online data.
  }
  return response;
}

async function readCachedResponse(request) {
  try {
    return await caches.match(request);
  } catch {
    return undefined;
  }
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    return cacheSuccessfulResponse(request, response);
  } catch {
    return (
      (await readCachedResponse(request)) ||
      (await readCachedResponse("/")) ||
      (await readCachedResponse("/offline.html")) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request, event) {
  const network = fetch(request)
    .then((response) => cacheSuccessfulResponse(request, response))
    .catch(() => null);
  // Keep the worker alive until the refreshed response has reached the cache.
  event.waitUntil(network.then(() => undefined));
  const cached = await readCachedResponse(request);

  if (cached && hasExpectedAssetType(request, cached)) {
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
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
