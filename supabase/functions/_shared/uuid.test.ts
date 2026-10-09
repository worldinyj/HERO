import { isUuid } from "./uuid.ts";

Deno.test("UUID preflight accepts standard string forms only", () => {
  for (const value of [
    "00000000-0000-0000-0000-000000000001",
    "A1000000-0000-0000-0000-000000000001",
  ]) {
    if (!isUuid(value)) throw new Error("valid UUID rejected");
  }
});

Deno.test("UUID preflight rejects malformed or non-string input", () => {
  for (const value of [
    "", "x", "a1000000-0000-0000-0000-00000000000",
    "a1000000-0000-0000-0000-000000000001 ",
    "a1000000-0000-0000-0000-000000000001/extra",
    42, {}, [], null, undefined,
  ]) {
    if (isUuid(value)) throw new Error("invalid UUID accepted");
  }
});
