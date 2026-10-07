function parseArgs(argv) {
  const value = (prefix) =>
    argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    appUrl: value("--app-url="),
    strict: argv.includes("--strict"),
    json: argv.includes("--json"),
    selfTest: argv.includes("--self-test"),
  };
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function result(id, ok, detail) {
  return {
    id,
    status: ok ? "pass" : "blocked",
    detail,
  };
}

function validateSecurityHeaders(headers) {
  const checks = [];
  const contentTypeOptions = headers.get("x-content-type-options") ?? "";
  const referrerPolicy = headers.get("referrer-policy") ?? "";
  const frameOptions = headers.get("x-frame-options") ?? "";
  const permissions = headers.get("permissions-policy") ?? "";

  checks.push(
    result(
      "header:x-content-type-options",
      contentTypeOptions.toLowerCase() === "nosniff",
      contentTypeOptions || "missing",
    ),
  );
  checks.push(
    result(
      "header:referrer-policy",
      referrerPolicy.toLowerCase().includes("strict-origin-when-cross-origin"),
      referrerPolicy || "missing",
    ),
  );
  checks.push(
    result(
      "header:x-frame-options",
      frameOptions.toUpperCase() === "DENY",
      frameOptions || "missing",
    ),
  );

  for (const directive of ["camera=()", "microphone=()", "geolocation=()"]) {
    checks.push(
      result(
        "header:permissions-policy:" + directive,
        permissions.toLowerCase().includes(directive),
        permissions || "missing",
      ),
    );
  }

  return checks;
}

function validateAppShell(html, path) {
  const rootPresent =
    /<div[^>]+id=["']root["'][^>]*>/iu.test(html) ||
    /<div[^>]+id=root[^>]*>/iu.test(html);
  const manifestPresent = /rel=["']manifest["']/iu.test(html);

  return [
    result(
      "spa:" + path + ":root",
      rootPresent,
      rootPresent ? "root mount present" : "root mount missing",
    ),
    result(
      "spa:" + path + ":manifest",
      manifestPresent,
      manifestPresent ? "manifest link present" : "manifest link missing",
    ),
  ];
}

function validateManifest(text) {
  try {
    const manifest = JSON.parse(text);
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];

    return [
      result(
        "pwa:manifest:name",
        manifest.name === "HERO — Human Error Risk Operations",
        String(manifest.name ?? "missing"),
      ),
      result(
        "pwa:manifest:display",
        manifest.display === "standalone",
        String(manifest.display ?? "missing"),
      ),
      result(
        "pwa:manifest:start_url",
        manifest.start_url === "/",
        String(manifest.start_url ?? "missing"),
      ),
      result(
        "pwa:manifest:icons",
        icons.length > 0,
        icons.length > 0 ? String(icons.length) + " icon(s)" : "no icons",
      ),
    ];
  } catch (cause) {
    return [
      result(
        "pwa:manifest:json",
        false,
        cause instanceof Error ? cause.message : "invalid_json",
      ),
    ];
  }
}

function validateServiceWorker(text) {
  return [
    result(
      "pwa:service-worker:cache-prefix",
      text.includes("hero-pwa-"),
      text.includes("hero-pwa-")
        ? "HERO cache prefix present"
        : "cache prefix missing",
    ),
    result(
      "pwa:service-worker:fetch-handler",
      text.includes('addEventListener("fetch"'),
      text.includes('addEventListener("fetch"')
        ? "fetch handler present"
        : "fetch handler missing",
    ),
  ];
}

async function get(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      headers: response.headers,
      text,
    };
  } catch (cause) {
    return {
      ok: false,
      status: null,
      url,
      headers: new Headers(),
      text: "",
      error: cause instanceof Error ? cause.message : "network_error",
    };
  }
}

function selfTest() {
  const goodHeaders = new Headers({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  });

  if (
    validateSecurityHeaders(goodHeaders).some(
      (check) => check.status !== "pass",
    )
  ) {
    throw new Error("good security header fixture blocked");
  }

  const badHeaders = new Headers();
  if (
    validateSecurityHeaders(badHeaders).every(
      (check) => check.status === "pass",
    )
  ) {
    throw new Error("bad security header fixture unexpectedly passed");
  }

  const shell =
    '<!doctype html><html><head><link rel="manifest" href="/manifest.webmanifest"></head><body><div id="root"></div></body></html>';
  if (
    validateAppShell(shell, "/").some((check) => check.status !== "pass")
  ) {
    throw new Error("app shell fixture blocked");
  }

  const manifest = JSON.stringify({
    name: "HERO — Human Error Risk Operations",
    display: "standalone",
    start_url: "/",
    icons: [{ src: "/pwa-icon.svg" }],
  });
  if (
    validateManifest(manifest).some((check) => check.status !== "pass")
  ) {
    throw new Error("manifest fixture blocked");
  }

  const sw =
    'const CACHE_PREFIX="hero-pwa-"; self.addEventListener("fetch",()=>{});';
  if (
    validateServiceWorker(sw).some((check) => check.status !== "pass")
  ) {
    throw new Error("service worker fixture blocked");
  }

  console.log("STAGING_HTTP_SELF_TEST_PASS");
}

const options = parseArgs(process.argv.slice(2));

if (options.selfTest) {
  selfTest();
  process.exit(0);
}

const origin = normalizeOrigin(
  options.appUrl ?? process.env.HERO_APP_URL ?? "",
);
if (!origin) {
  console.error("STAGING_HTTP_FAIL: provide an HTTPS --app-url");
  process.exit(1);
}

const checks = [];
const pages = ["/", "/login", "/privacy", "/terms", "/leaderboard"];

for (const path of pages) {
  const response = await get(new URL(path, origin).toString());
  checks.push(
    result(
      "http:" + path,
      response.ok,
      response.ok
        ? "HTTP " + response.status + " " + response.url
        : "HTTP " +
            String(response.status ?? "network") +
            " " +
            String(response.error ?? ""),
    ),
  );

  if (response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    checks.push(
      result(
        "content-type:" + path,
        contentType.toLowerCase().includes("text/html"),
        contentType || "missing",
      ),
    );
    checks.push(...validateAppShell(response.text, path));

    if (path === "/") {
      checks.push(...validateSecurityHeaders(response.headers));
    }
  }
}

const manifestResponse = await get(
  new URL("/manifest.webmanifest", origin).toString(),
);
checks.push(
  result(
    "http:/manifest.webmanifest",
    manifestResponse.ok,
    manifestResponse.ok
      ? "HTTP " + manifestResponse.status
      : "HTTP " + String(manifestResponse.status ?? "network"),
  ),
);
if (manifestResponse.ok) {
  checks.push(...validateManifest(manifestResponse.text));
}

const swResponse = await get(new URL("/sw.js", origin).toString());
checks.push(
  result(
    "http:/sw.js",
    swResponse.ok,
    swResponse.ok
      ? "HTTP " + swResponse.status
      : "HTTP " + String(swResponse.status ?? "network"),
  ),
);
if (swResponse.ok) {
  checks.push(...validateServiceWorker(swResponse.text));
}

const blocked = checks.filter((check) => check.status === "blocked");
const report = {
  appOrigin: origin,
  verdict:
    blocked.length === 0 ? "staging_http_ready" : "staging_http_blocked",
  checks,
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("HERO staging HTTP smoke");
  console.log("=======================");
  console.log("verdict: " + report.verdict);
  console.log("");

  for (const check of checks) {
    console.log(
      "[" +
        check.status.toUpperCase() +
        "] " +
        check.id +
        " — " +
        check.detail,
    );
  }
}

if (options.strict && blocked.length > 0) {
  process.exitCode = 2;
}
