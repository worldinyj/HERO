import { describe, expect, it } from "vitest";
import { cleanupAfterConfirmedCommit } from "./submissionCleanup";

describe("committed session cleanup is non-authoritative", () => {
  it("marks successful IndexedDB deletion as clean", async () => {
    const result = await cleanupAfterConfirmedCommit(async () => {});
    expect(result).toEqual({ cleanupPending: false });
  });

  it("does not convert a committed response into rejection on IDB abort", async () => {
    const result = await cleanupAfterConfirmedCommit(async () => {
      throw new Error("indexeddb_transaction_aborted");
    });
    expect(result).toEqual({ cleanupPending: true });
  });

  it("also contains synchronous cleanup exceptions", async () => {
    const result = await cleanupAfterConfirmedCommit(() => {
      throw new Error("indexeddb_unavailable");
    });
    expect(result).toEqual({ cleanupPending: true });
  });

  it("allows a later successful local cleanup", async () => {
    let calls = 0;
    const cleanup = async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient_error");
    };
    expect(await cleanupAfterConfirmedCommit(cleanup)).toEqual({ cleanupPending: true });
    expect(await cleanupAfterConfirmedCommit(cleanup)).toEqual({ cleanupPending: false });
  });
});
