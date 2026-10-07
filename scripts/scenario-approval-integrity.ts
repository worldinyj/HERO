import { createHash } from "node:crypto";

export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;

export function sha256Content(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_PATTERN.test(value);
}

export function approvedContentHashMatches(
  expected: unknown,
  content: string | Buffer,
): boolean {
  return isSha256Hex(expected) && sha256Content(content) === expected;
}
