import { singleLookupOutcome, listLookupOutcome } from "./lookupOutcome.ts";

Deno.test("single row: outage is never a not-found response", () => {
  const err = { code: "XX000", message: "database temporarily unavailable" };
  if (singleLookupOutcome(null, err) !== "failed") throw new Error("outage masked as missing");
  if (singleLookupOutcome({ id: "row" }, err) !== "failed") throw new Error("error ignored");
  if (singleLookupOutcome(null, null) !== "missing") throw new Error("legitimate absence rejected");
  if (singleLookupOutcome({ id: "row" }, null) !== "found") throw new Error("row not found");
});

Deno.test("malformed successful single-row responses fail closed", () => {
  for (const data of [undefined, [], 4, "row", true]) {
    if (singleLookupOutcome(data, null) !== "failed") throw new Error("malformed row accepted");
  }
});

Deno.test("list lookup: outage and null do not mean no results", () => {
  if (listLookupOutcome([], { message: "timeout" }) !== "failed") throw new Error("error ignored");
  if (listLookupOutcome(null, null) !== "failed") throw new Error("null accepted as empty");
  if (listLookupOutcome({}, null) !== "failed") throw new Error("object accepted as list");
  if (listLookupOutcome([], null) !== "empty") throw new Error("empty list rejected");
  if (listLookupOutcome([{ id: 1 }], null) !== "found") throw new Error("populated list rejected");
});
