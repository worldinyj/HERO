import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroAudioManager } from "./audioManager";
import { matchesNarration, normalizeAudioSettings, type AudioManifestAsset, type NarrationBinding } from "./audioTypes";

const request: NarrationBinding = { scenarioId: "s00_tutorial", scenarioVersion: 1, nodeId: "intro", field: "text", text: "현장에 도착했습니다." };
const asset: AudioManifestAsset = { id: "NAR-01", kind: "narration", path: "/audio/narration/intro.mp3", approved: true, narration: request };
class FakeAudio {
  static instances: FakeAudio[] = [];
  src: string; preload = ""; volume = 1; paused = true;
  listeners = new Map<string, () => void>();
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
  addEventListener(event: string, callback: () => void) { this.listeners.set(event, callback); }
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
}
function setup(assets = [asset]) {
  FakeAudio.instances = [];
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() } });
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ assets }) })));
  const manager = new HeroAudioManager();
  manager.unlock(); manager.updateSettings({ initialized: true });
  return manager;
}
afterEach(() => vi.unstubAllGlobals());
describe("narration binding and lifecycle", () => {
  it("requires approved matching text, version and action", () => {
    expect(matchesNarration(asset, request)).toBe(true);
    for (const patch of [{ text: "別の文" }, { scenarioVersion: 2 }, { nodeId: "other" }, { actionId: "hidden_info" }]) {
      expect(matchesNarration(asset, { ...request, ...patch })).toBe(false);
    }
    expect(matchesNarration({ ...asset, approved: false }, request)).toBe(false);
    expect(matchesNarration({ ...asset, path: "https://external/audio.mp3" }, request)).toBe(false);
  });
  it("preserves mute intent from legacy all-muted preferences", () => {
    expect(normalizeAudioSettings({ initialized: true, bgmMuted: true, sfxMuted: true }).narrationMuted).toBe(true);
  });
  it("missing files never create an audio element", async () => {
    const manager = setup([]);
    expect(await manager.playNarration(request)).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
  });
  it("blocks playback without a user gesture", async () => {
    setup(); const manager = new HeroAudioManager(); manager.updateSettings({ initialized: true });
    expect(await manager.playNarration(request)).toBe(false);
  });
  it("cancels a pending manifest lookup when leaving a scene", async () => {
    const manager = setup();
    const pending = manager.playNarration(request); manager.stopNarration();
    expect(await pending).toBe(false);
    expect(FakeAudio.instances).toHaveLength(0);
  });
  it("replaces a playing voice and stops on mute", async () => {
    const manager = setup();
    expect(await manager.playNarration(request)).toBe(true);
    const first = FakeAudio.instances[0]!;
    expect(await manager.playNarration(request)).toBe(true);
    expect(first.paused).toBe(true); expect(first.src).toBe("");
    manager.updateSettings({ narrationMuted: true });
    expect(FakeAudio.instances[1]!.paused).toBe(true);
    expect(await manager.playNarration(request)).toBe(false);
  });
  it("cleans up on ended and loading errors", async () => {
    const manager = setup();
    await manager.playNarration(request);
    FakeAudio.instances[0]!.listeners.get("ended")!();
    expect(FakeAudio.instances[0]!.src).toBe("");
    await manager.playNarration(request);
    FakeAudio.instances[1]!.listeners.get("error")!();
    expect(FakeAudio.instances[1]!.src).toBe("");
  });
  it("rejects playback in a hidden tab and at zero volume", async () => {
    const manager = setup(); vi.stubGlobal("document", { hidden: true });
    expect(await manager.playNarration(request)).toBe(false);
    vi.stubGlobal("document", { hidden: false }); manager.updateSettings({ narrationVolume: 0 });
    expect(await manager.playNarration(request)).toBe(false);
  });
  it("ducks BGM only while a narration voice is active and applies live volume", async () => {
    const bgm: AudioManifestAsset = { id: "BGM-01", kind: "bgm", path: "/audio/bgm/base.mp3", approved: true };
    const manager = setup([asset, bgm]);
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() },
      requestAnimationFrame: (callback: (time: number) => void) => { callback(performance.now() + 1000); return 1; }, cancelAnimationFrame: vi.fn() });
    await manager.playBgm("BGM-01");
    const music = FakeAudio.instances[0]!;
    expect(music.volume).toBeCloseTo(0.45);
    await manager.playNarration(request);
    expect(music.volume).toBeCloseTo(0.45 * 0.42);
    manager.updateSettings({ narrationVolume: 0.35 });
    expect(FakeAudio.instances[1]!.volume).toBeCloseTo(0.35);
    manager.stopNarration();
    expect(music.volume).toBeCloseTo(0.45);
  });
  it("does not let an old play promise revive a stopped voice", async () => {
    const manager = setup();
    let finish!: () => void;
    vi.spyOn(FakeAudio.prototype, "addEventListener").mockImplementation(function(this: FakeAudio, event, callback) {
      this.listeners.set(event, callback);
      this.play = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    });
    const pending = manager.playNarration(request);
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    manager.stopNarration(); finish();
    expect(await pending).toBe(false); expect(FakeAudio.instances[0]!.src).toBe("");
    vi.restoreAllMocks();
  });
});
