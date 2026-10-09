import { buildInviteUrl } from "./inviteUrl.ts";

Deno.test("invite URL uses the configured HTTPS origin", () => {
  if (buildInviteUrl("https://hero.example", "alpha_123") !== "https://hero.example/i/alpha_123") {
    throw new Error("incorrect HTTPS invitation URL");
  }
});

Deno.test("local E2E allows loopback HTTP only", () => {
  const value = buildInviteUrl("http://127.0.0.1:4173", "test-token");
  if (value !== "http://127.0.0.1:4173/i/test-token") {
    throw new Error("incorrect localhost invitation URL");
  }
});

Deno.test("invalid SITE_URL never produces an invitation", () => {
  for (const siteUrl of [
    undefined,
    "",
    "example.invalid",
    "http://hero.example",
    "https://hero.example/path",
    "https://hero.example/?next=elsewhere",
    "https://user:pass@hero.example",
    "javascript:alert(1)",
  ]) {
    let threw = false;
    try {
      buildInviteUrl(siteUrl, "test-token");
    } catch {
      threw = true;
    }
    if (!threw) throw new Error(`accepted invalid origin ${String(siteUrl)}`);
  }
});

Deno.test("invitation tokens remain in the path, not a query", () => {
  const value = buildInviteUrl("https://hero.example", "a/b?c");
  if (value !== "https://hero.example/i/a%2Fb%3Fc") {
    throw new Error("invite token not encoded");
  }
});
