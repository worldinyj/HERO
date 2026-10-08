import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRANCH, PAGES_PROJECT, PAGES_DOMAIN, safeOrigin,
  safePreviewBranch, safeProject, previewAppUrl, safePreviewOrigin,
  isValidEvidence } from "./hero-local.mjs";

test("GitHub origin accepts the exact repo over HTTPS and SSH", () => {
  for (const remote of ["https://github.com/worldinyj/HERO.git",
    "git@github.com:worldinyj/HERO.git", "ssh://git@github.com/worldinyj/HERO"]) {
    assert.equal(safeOrigin(remote), true);
  }
  for (const remote of ["https://github.com/other/HERO",
    "https://evilgithub.com/worldinyj/HERO", "file:///tmp/worldinyj/HERO"]) {
    assert.equal(safeOrigin(remote), false);
  }
});
test("preview name requires qa- prefix and project slug", () => {
  for (const value of ["qa-local", "qa-hero-1"]) assert.equal(safePreviewBranch(value), true);
  for (const value of ["main", "master", "production", "prod", "release",
    "work/actions-paused-batch-20261008", "QA-local", "qa-../evil"]) {
    assert.equal(safePreviewBranch(value), false);
  }
  assert.equal(safeProject("hero"), true);
  assert.equal(safeProject("../prod"), false);
});
test("Cloudflare project slug and pages.dev domain are deliberately different", () => {
  assert.equal(PAGES_PROJECT, "hero");
  assert.equal(PAGES_DOMAIN, "hero-dnr.pages.dev");
  assert.equal(previewAppUrl("qa-local"), "https://qa-local.hero-dnr.pages.dev");
  assert.throws(() => previewAppUrl("main"), /Invalid preview branch/);
  for (const origin of [
    "https://qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev/",
    "https://qa-build-1.hero-dnr.pages.dev",
  ]) assert.equal(safePreviewOrigin(origin), true, origin);
  for (const origin of [
    "https://hero-dnr.pages.dev",
    "https://qa-local.hero.pages.dev",
    "https://qa-local.attacker.pages.dev",
    "http://qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev:444",
    "https://qa-local.hero-dnr.pages.dev/other",
    "https://qa-local.hero-dnr.pages.dev/?x=1",
    "https://qa-local.hero-dnr.pages.dev/#frag",
    "https://user:pass@qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev.attacker.invalid",
  ]) assert.equal(safePreviewOrigin(origin), false, origin);
});

test("preview evidence requires DB, exact SHA/env/dist, and recent success", () => {
  const now = Date.parse("2026-10-08T09:00:00.000Z");
  const expected = { sha: "1".repeat(40), envHash: "env-hash", distHash: "dist-hash" };
  const record = {
    version: 1, branch: BRANCH, sha: expected.sha, passedAt: new Date(now).toISOString(),
    withDb: true, envHash: expected.envHash, distHash: expected.distHash,
  };
  assert.equal(isValidEvidence(record, expected, now + 1000), true);
  assert.equal(isValidEvidence({ ...record, withDb: false }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, sha: "2".repeat(40) }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, envHash: "other" }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, distHash: "other" }, expected, now), false);
  assert.equal(isValidEvidence(record, expected, now + 25 * 60 * 60 * 1000), false);
  assert.equal(isValidEvidence(record, expected, now - 1), false);
  assert.equal(isValidEvidence(null, expected, now), false);
});

// Supabase CLI creates this metadata after a local stack starts. It must
// never cause checkClean() to reject an otherwise clean QA run.
test("Supabase local CLI branch metadata is excluded by Git", () => {
  const actual = spawnSync("git", [
    "check-ignore", "--no-index", "--quiet", "--",
    "supabase/.branches/_current_branch",
  ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(actual.status, 0, actual.stderr || "Git must ignore Supabase CLI state");
});
