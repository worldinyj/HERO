import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../apps/web/public/sw.js", import.meta.url), "utf8");
const origin = "https://hero.example";
function response(body, mime = "application/javascript") {
  const result = new Response(body, { headers: { "content-type": mime } });
  Object.defineProperty(result, "type", { value: "basic" });
  return result;
}
function worker(fetch, initial = []) {
  const entries = new Map(initial);
  const listeners = new Map();
  const key = request => typeof request === "string" ? request : request.url;
  const cache = { put: async (request, value) => entries.set(key(request), value), match: async request => entries.get(key(request)) };
  vm.runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name, callback) => listeners.set(name, callback) },
    caches: { open: async () => cache, match: cache.match }, fetch, URL, Response, Set,
  });
  return {
    entries,
    request(path, destination = "script", mode = "cors") {
      const lifetime = [];
      let result;
      listeners.get("fetch")({
        request: { url: new URL(path, origin).href, method: "GET", destination, mode },
        respondWith: promise => { result = promise; },
        waitUntil: promise => lifetime.push(promise),
      });
      return { result, lifetime };
    },
  };
}

test("cached JavaScript is immediate while the event keeps its refresh alive", async () => {
  let finish;
  const url = `${origin}/assets/app.js`;
  const runtime = worker(() => new Promise(resolve => { finish = resolve; }), [[url, response("old")]]);
  const event = runtime.request("/assets/app.js");
  assert.equal(await (await event.result).text(), "old");
  assert.equal(event.lifetime.length, 1);
  finish(response("new"));
  await Promise.all(event.lifetime);
  assert.equal(await runtime.entries.get(url).text(), "new");
});

for (const [file, destination] of [["app.js", "script"], ["app.css", "style"]]) {
  test(`HTTP 200 HTML never poisons the ${destination} cache`, async () => {
    const runtime = worker(async () => response("<html>SPA fallback</html>", "text/html; charset=utf-8"));
    const event = runtime.request(`/assets/${file}`, destination);
    assert.equal((await event.result).type, "error");
    await Promise.all(event.lifetime);
    assert.equal(runtime.entries.size, 0);
  });
}

test("an existing HTML response under a script URL is ignored and replaced", async () => {
  const url = `${origin}/assets/app.js`;
  const runtime = worker(async () => response("recovered"), [[url, response("<html>old fallback</html>", "text/html")]]);
  const event = runtime.request("/assets/app.js");
  assert.equal(await (await event.result).text(), "recovered");
  await Promise.all(event.lifetime);
  assert.equal(await runtime.entries.get(url).text(), "recovered");
});

test("offline JavaScript and document navigation still use saved responses", async () => {
  const runtime = worker(async () => { throw new Error("offline"); }, [
    [`${origin}/assets/app.js`, response("offline app")],
    ["/", response("offline shell", "text/html")],
  ]);
  const asset = runtime.request("/assets/app.js");
  assert.equal(await (await asset.result).text(), "offline app");
  await Promise.all(asset.lifetime);
  const navigation = runtime.request("/campaign", "document", "navigate");
  assert.equal(await (await navigation.result).text(), "offline shell");
});

test("external scripts are not intercepted or cached", () => {
  const runtime = worker(() => { throw new Error("must not fetch"); });
  const event = runtime.request("https://external.example/sdk.js");
  assert.equal(event.result, undefined);
  assert.equal(event.lifetime.length, 0);
});
