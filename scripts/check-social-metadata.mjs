import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync("apps/web/index.html", "utf8");
const png = readFileSync("apps/web/public/og-hero.png");

for (const tag of [
  'property="og:type"',
  'property="og:locale"',
  'property="og:title"',
  'property="og:description"',
  'property="og:url"',
  'property="og:image"',
  'property="og:image:alt"',
  'name="twitter:card"',
  'name="twitter:image"',
]) {
  assert.ok(html.includes(tag), `Missing OG metadata: ${tag}`);
}
assert.ok(html.includes('content="summary_large_image"'));
assert.ok(html.includes("https://hero-dnr.pages.dev/og-hero.png"));
assert.ok(!/token_hash|invitee_name|\/i\/[^"]+/.test(html));
assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
const builtHtmlFile = "apps/web/dist/index.html";
const builtImageFile = "apps/web/dist/og-hero.png";
assert.ok(existsSync(builtHtmlFile), "Missing built HTML; run pnpm build first");
assert.ok(existsSync(builtImageFile), "OG image absent from production dist");
const builtHtml = readFileSync(builtHtmlFile, "utf8");
const builtPng = readFileSync(builtImageFile);
assert.ok(builtHtml.includes('property="og:image"'), "Production HTML lost OG image tag");
assert.ok(builtHtml.includes('name="twitter:card"'), "Production HTML lost Twitter card");
assert.ok(!/token_hash|invitee_name/.test(builtHtml), "Production HTML contains private token metadata");
assert.deepEqual(builtPng, png, "Built OG image differs from source");
console.log("SOCIAL_METADATA_PASS");
