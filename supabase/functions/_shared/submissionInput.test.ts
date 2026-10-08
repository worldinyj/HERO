import { parseSessionSubmission, parseSubmissionActions } from "./submissionInput.ts";

const validId = "a1000000-0000-4000-8000-000000000001";
const good = [
  { type: "continue" },
  { type: "choice", actionId: "proceed_after_peer_check" },
  { type: "info", actionId: "verify_shift_log" },
  { type: "card", cardId: "stop_work_authority" },
];

Deno.test("accepts all four legitimate engine decision types in original order", () => {
  const parsed = parseSessionSubmission({
    sessionId: validId, actions: good,
    reflectionAnswered: true, swissCheeseViewed: false,
  });
  if (!parsed || JSON.stringify(parsed.actions) !== JSON.stringify(good)) {
    throw new Error("valid decision log rejected or reordered");
  }
  if (parsed.reflectionAnswered !== true || parsed.swissCheeseViewed !== false) {
    throw new Error("reflection flags changed");
  }
});

Deno.test("rejects malformed JSON types before engine replay", () => {
  for (const actions of [
    null, {}, "[]", 42, [null], [false], ["continue"], [[]],
    [{ type: "unknown" }], [{ type: "choice" }],
    [{ type: "choice", actionId: 42 }],
    [{ type: "card", cardId: {} }],
    [{ type: "continue", cardId: "injected" }],
    [{ type: "choice", actionId: "x", cardId: "y" }],
    [{ type: "info", actionId: " x " }],
    [{ type: "card", cardId: "" }],
    [{ type: "choice", actionId: "x".repeat(257) }],
    Array.from({ length: 251 }, () => ({ type: "continue" })),
  ]) {
    if (parseSubmissionActions(actions) !== null) {
      throw new Error("malformed action log was accepted");
    }
  }
});

Deno.test("valid action lists are not silently changed and limits are inclusive", () => {
  if (parseSubmissionActions([])?.length !== 0) throw new Error("empty log rejected");
  if (parseSubmissionActions(Array.from({ length: 250 }, () => ({ type: "continue" })))?.length !== 250) {
    throw new Error("250-action limit rejected");
  }
  if (parseSubmissionActions(good)?.length !== 4) throw new Error("mixed log rejected");
});

Deno.test("rejects invalid flags and wrong body shape", () => {
  for (const value of [
    null, undefined, [], 3, "string", {},
    { sessionId: validId, actions: good, reflectionAnswered: "true" },
    { sessionId: validId, actions: good, swissCheeseViewed: 1 },
    { sessionId: validId, actions: { 0: good[0] } },
    { sessionId: validId, actions: [null] },
  ]) {
    if (parseSessionSubmission(value) !== null) {
      throw new Error("malformed submission body was accepted");
    }
  }
  const omitted = parseSessionSubmission({ sessionId: validId });
  if (!omitted || omitted.reflectionAnswered || omitted.swissCheeseViewed ||
      omitted.actions.length !== 0) {
    throw new Error("legacy optional fields handled incorrectly");
  }
});
