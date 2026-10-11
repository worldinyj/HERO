import { afterEach, describe, expect, it, vi } from "vitest";
import { getScenarioById } from "@hero/content";
vi.mock("../../lib/gamePersistence", () => ({ loadGameSession: vi.fn(), saveGameSession: vi.fn(async () => {}), clearGameSession: vi.fn(async () => {}) }));
import { loadGameSession } from "../../lib/gamePersistence";
import { useTutorialGameStore } from "./gameStore";
afterEach(() => vi.clearAllMocks());
describe("tutorial hydration ordering", () => {
  it("a stale restore cannot reset a game started by the newer restore", async () => {
    const scenario = getScenarioById("s00_tutorial")!;
    let firstResolve!: (value: null) => void;
    vi.mocked(loadGameSession).mockImplementationOnce(() => new Promise(resolve => { firstResolve = resolve; })).mockResolvedValueOnce(null);
    const first = useTutorialGameStore.getState().hydrate(scenario);
    await useTutorialGameStore.getState().hydrate(scenario);
    useTutorialGameStore.getState().start(scenario);
    const started = useTutorialGameStore.getState().game;
    firstResolve(null); await first;
    expect(useTutorialGameStore.getState().game).toBe(started);
    expect(useTutorialGameStore.getState().hydrating).toBe(false);
  });
});
