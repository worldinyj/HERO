import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroAudioManager } from "./audioManager";
import type { AudioManifestAsset } from "./audioTypes";
const assets: AudioManifestAsset[] = [
  { id: "A", kind: "bgm", approved: true, path: "/audio/bgm/a.mp3", defaultVolume: 0.5 },
  { id: "B", kind: "bgm", approved: true, path: "/audio/bgm/b.mp3" },
  { id: "C", kind: "bgm", approved: true, path: "/audio/bgm/c.mp3" },
  { id: "S", kind: "sfx", approved: true, path: "/audio/sfx/s.mp3", defaultVolume: 0.25 },
];
class FakeAudio {
  static instances: FakeAudio[] = [];
  static delayed = false;
  src: string; volume = 1; preload = ""; loop = false; paused = true;
  finish: () => void = () => {};
  listeners = new Map<string, () => void>();
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this); }
  addEventListener(event: string, listener: () => void) { this.listeners.set(event, listener); }
  play = vi.fn(async () => {
    if (FakeAudio.delayed) await new Promise<void>(resolve => { this.finish = resolve; });
    this.paused = false;
  });
  pause = vi.fn(() => { this.paused = true; });
}
function setup(manifestDelay = false) {
  FakeAudio.instances = []; FakeAudio.delayed = false;
  const frames = new Map<number, (time: number) => void>(); let id = 0;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: vi.fn() },
    requestAnimationFrame: (callback: (time: number) => void) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => frames.delete(key) });
  vi.stubGlobal("document", { hidden: false }); vi.stubGlobal("Audio", FakeAudio);
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (manifestDelay) await pending;
    return { ok: true, json: async () => ({ assets }) };
  }));
  const manager = new HeroAudioManager(); manager.unlock(); manager.updateSettings({ initialized: true });
  const flush = (time = performance.now() + 1000) => { for (const [key, callback] of [...frames]) { frames.delete(key); callback(time); } };
  return { manager, release, flush };
}
afterEach(() => vi.unstubAllGlobals());
describe("BGM and SFX lifecycle", () => {
  it("clamps a frame timestamp earlier than a newly started crossfade", async () => {
    const { manager, flush } = setup(); await manager.playBgm("A"); flush();
    const previousVolume = FakeAudio.instances[0]!.volume;
    await manager.playBgm("B"); flush(-10000);
    expect(FakeAudio.instances[0]!.volume).toBe(previousVolume);
    expect(FakeAudio.instances[1]!.volume).toBe(0);
    flush(); expect(FakeAudio.instances[1]!.volume).toBeGreaterThan(0);
  });
  it("does not start a BGM lookup after its route was stopped", async () => {
    const { manager, release } = setup(true);
    const pending = manager.playBgm("A"); manager.stopBgm(); release();
    expect(await pending).toBe(false); expect(FakeAudio.instances).toHaveLength(0);
  });
  it("latest BGM request wins when manifest reads complete together", async () => {
    const { manager, release } = setup(true);
    const first = manager.playBgm("A"); const second = manager.playBgm("B"); release();
    expect(await first).toBe(false); expect(await second).toBe(true);
    expect(FakeAudio.instances.map(a => a.src)).toEqual(["/audio/bgm/b.mp3"]);
  });
  it("a stopped pending native BGM play cannot revive", async () => {
    const { manager } = setup(); FakeAudio.delayed = true;
    const pending = manager.playBgm("A");
    await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    manager.stopBgm(0); FakeAudio.instances[0]!.finish();
    expect(await pending).toBe(false); expect(FakeAudio.instances[0]!.paused).toBe(true); expect(FakeAudio.instances[0]!.src).toBe("");
  });
  it("cancels SFX lookups on mute or stop, including toggling mute back", async () => {
    const { manager, release } = setup(true);
    const pending = manager.playSfx("S"); manager.updateSettings({ sfxMuted: true }); manager.updateSettings({ sfxMuted: false }); release();
    await pending; expect(FakeAudio.instances).toHaveLength(0);
  });
  it("preserves asset gain after live volume and sensory settings changes", async () => {
    const { manager, flush } = setup(); await manager.playBgm("A"); flush(); await manager.playSfx("S");
    expect(FakeAudio.instances[0]!.volume).toBeCloseTo(0.45 * 0.5);
    expect(FakeAudio.instances[1]!.volume).toBeCloseTo(0.7 * 0.25);
    manager.updateSettings({ bgmVolume: 0.6, sfxVolume: 0.4, reducedSensory: true });
    expect(FakeAudio.instances[0]!.volume).toBeCloseTo(0.6 * 0.5 * 0.72);
    expect(FakeAudio.instances[1]!.volume).toBeCloseTo(0.4 * 0.25 * 0.58);
  });
  it("replacing a running crossfade releases the previous outgoing track", async () => {
    const { manager, flush } = setup(); await manager.playBgm("A"); flush();
    await manager.playBgm("B"); await manager.playBgm("C");
    expect(FakeAudio.instances[0]!.src).toBe(""); expect(FakeAudio.instances[0]!.paused).toBe(true);
    flush(); expect(FakeAudio.instances[1]!.src).toBe(""); expect(FakeAudio.instances[2]!.paused).toBe(false);
  });
  it("zero-volume and hidden requests never create audio elements", async () => {
    const { manager } = setup(); manager.updateSettings({ bgmVolume: 0, sfxVolume: 0 });
    expect(await manager.playBgm("A")).toBe(false); await manager.playSfx("S");
    manager.updateSettings({ bgmVolume: 0.5, sfxVolume: 0.5 }); vi.stubGlobal("document", { hidden: true });
    expect(await manager.playBgm("A")).toBe(false); await manager.playSfx("S"); expect(FakeAudio.instances).toHaveLength(0);
  });
  it("cleans up SFX load errors and stops a pending play that resolves afterward", async () => {
    const { manager } = setup(); FakeAudio.delayed = true;
    const pending = manager.playSfx("S"); await vi.waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    const voice = FakeAudio.instances[0]!; voice.listeners.get("error")!(); voice.finish(); await pending;
    expect(voice.src).toBe(""); expect(voice.paused).toBe(true);
  });
});
