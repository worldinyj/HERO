import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { READ_DEADLINE_MS, ReadTimeoutError } from "../../lib/readWithDeadline";
import { readManagerDashboard } from "./managerDashboardQueries";

const rpcNames = ["manager_player_rows", "manager_pending_invites", "manager_job_aggregates"];
afterEach(() => vi.useRealTimers());
function fixture(fetch: typeof globalThis.fetch) {
  return createClient("http://127.0.0.1:54321", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json" },
});

describe("manager dashboard read recovery", () => {
  it("queries only the three existing read RPCs and returns verified empty arrays", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response([]));
    await expect(readManagerDashboard(fixture(fetch))).resolves.toEqual({ participation: [], pending: [], aggregate: [] });
    expect(fetch.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual(rpcNames.map(name => `/rest/v1/rpc/${name}`));
    expect(fetch.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
  });
  it.each(rpcNames)("rejects malformed %s output instead of confirming a mutation", async target => {
    const client = fixture(async input => response(String(input).endsWith(target) ? null : []));
    await expect(readManagerDashboard(client)).rejects.toThrow("manager_dashboard_result_invalid");
  });
  it.each(rpcNames)("does not turn a %s permission error into an empty roster", async target => {
    const client = fixture(async input => String(input).endsWith(target) ? response({ message: "denied" }, 403) : response([]));
    await expect(readManagerDashboard(client)).rejects.toMatchObject({ message: "denied" });
  });
  it("times out even if transport ignores abort, then allows a fresh read without retrying a write", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
      signals.push(init!.signal!);
      return new Promise<Response>(() => {});
    });
    const old = readManagerDashboard(fixture(fetch));
    const rejected = expect(old).rejects.toBeInstanceOf(ReadTimeoutError);
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await rejected;
    expect(signals).toHaveLength(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(readManagerDashboard(fixture(async () => response([])))).resolves.toMatchObject({ participation: [] });
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels all three reads on owner cleanup and ignores late valid replies", async () => {
    vi.useFakeTimers();
    const owner = new AbortController();
    const signals: AbortSignal[] = [];
    const finish: Array<(response: Response) => void> = [];
    const client = fixture((_input, init) => {
      signals.push(init!.signal!);
      return new Promise(resolve => finish.push(resolve));
    });
    const pending = readManagerDashboard(client, owner.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1);
    owner.abort();
    await rejected;
    expect(signals).toHaveLength(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    finish.forEach(resolve => resolve(response([])));
    await vi.advanceTimersByTimeAsync(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
