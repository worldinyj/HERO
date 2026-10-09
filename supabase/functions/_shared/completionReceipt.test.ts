import { readCommittedCompletion } from "./completionReceipt.ts";

Deno.test("completion RPC must confirm matching persisted session and evaluation", () => {
  const good = {
    session_id: "session-123",
    already_completed: false,
    evaluation: { ending: "safe_complete", hpPoint: 120 },
  };
  const result = readCommittedCompletion(good, "session-123");
  if (!result || result.alreadyCompleted || result.evaluation.hpPoint !== 120) {
    throw new Error("valid stored result rejected");
  }
  const concurrent = readCommittedCompletion({
    ...good, already_completed: true,
    evaluation: { ending: "safe_stop", hpPoint: 30 },
  }, "session-123");
  if (!concurrent || !concurrent.alreadyCompleted || concurrent.evaluation.hpPoint !== 30) {
    throw new Error("concurrent stored winner must prevail");
  }
});

Deno.test("completion RPC does not silently confirm absent or mismatched commits", () => {
  const good = {
    session_id: "session-123", already_completed: false,
    evaluation: { ending: "safe_complete", hpPoint: 120 },
  };
  for (const v of [
    null, {}, { ...good, session_id: "other" },
    { ...good, already_completed: null },
    { ...good, evaluation: null },
    { ...good, evaluation: {} },
    { ...good, evaluation: { ending: "safe_stop", hpPoint: Number.NaN } },
  ]) {
    if (readCommittedCompletion(v, "session-123") !== null) {
      throw new Error("unverified RPC outcome accepted");
    }
  }
});
