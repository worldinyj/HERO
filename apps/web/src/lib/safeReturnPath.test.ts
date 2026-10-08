import { describe, expect, it } from "vitest";
import { safeAppReturnPath } from "./safeReturnPath";

describe("post-Kakao-login return paths", () => {
  it.each([
    ["/", "/"],
    ["/manager", "/manager"],
    ["/i/one_time_token", "/i/one_time_token"],
    ["/briefing/s00_tutorial?from=campaign", "/briefing/s00_tutorial?from=campaign"],
    ["/me#history", "/me#history"],
  ])("retains legitimate internal route %s", (input, expected) => {
    expect(safeAppReturnPath(input)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "javascript:alert(1)",
    "//evil.example/path",
    "///evil.example",
    "/\\evil.example/path",
    "/\\\\evil.example/path",
    "/manager\\evil.example",
    "/%2Fevil.example",
    "/%5Cevil.example",
    "/%0DSet-Cookie:bad",
    "/manager\r\nLocation: https://evil.example",
    " /manager",
    "manager",
  ])("rejects unsafe/ambiguous return path %s", (input) => {
    expect(safeAppReturnPath(input)).toBe("/");
  });
});
