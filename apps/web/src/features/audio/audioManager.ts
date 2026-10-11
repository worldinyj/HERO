import {
  DEFAULT_AUDIO_SETTINGS,
  isApprovedRuntimeAsset,
  normalizeAudioSettings,
  matchesNarration,
  type NarrationBinding,
  type AudioManifest,
  type AudioManifestAsset,
  type AudioSettings,
} from "./audioTypes";

const SETTINGS_KEY = "hero-audio-settings-v1";
const MANIFEST_URL = "/audio/audio_manifest.json";

type SettingsListener = (settings: AudioSettings) => void;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function parseStoredSettings(): AudioSettings {
  if (!canUseDom()) return { ...DEFAULT_AUDIO_SETTINGS };

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw
      ? normalizeAudioSettings(JSON.parse(raw))
      : { ...DEFAULT_AUDIO_SETTINGS };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function persistSettings(settings: AudioSettings): void {
  if (!canUseDom()) return;

  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings persistence is best-effort. Audio must never block gameplay.
  }
}

function safeManifest(value: unknown): AudioManifest {
  if (!value || typeof value !== "object") {
    return { version: "0", project: "HERO", assets: [] };
  }

  const source = value as Partial<AudioManifest>;
  const assets = Array.isArray(source.assets)
    ? source.assets.filter((asset): asset is AudioManifestAsset => {
        if (!asset || typeof asset !== "object") return false;
        const candidate = asset as Partial<AudioManifestAsset>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.kind === "string" &&
          typeof candidate.path === "string" &&
          typeof candidate.approved === "boolean"
        );
      })
    : [];

  return {
    version: typeof source.version === "string" ? source.version : "0",
    project: typeof source.project === "string" ? source.project : "HERO",
    assets,
  };
}

export class HeroAudioManager {
  private settings = parseStoredSettings();
  private listeners = new Set<SettingsListener>();
  private manifestPromise: Promise<AudioManifest> | null = null;
  private unlocked = false;
  private bgm: HTMLAudioElement | null = null;
  private bgmAssetId: string | null = null;
  private bgmAsset: AudioManifestAsset | null = null;
  private bgmRequest = 0;
  private sfxRequest = 0;
  private sfxAssets = new Map<HTMLAudioElement, AudioManifestAsset>();
  private fadingBgm: HTMLAudioElement | null = null;
  private dialogueDuck = false;
  private narration: HTMLAudioElement | null = null;
  private narrationAsset: AudioManifestAsset | null = null;
  private narrationRequest = 0;
  private sfxVoices: HTMLAudioElement[] = [];
  private volumeAnimation: number | null = null;

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());

    return () => {
      this.listeners.delete(listener);
    };
  }

  updateSettings(patch: Partial<AudioSettings>): void {
    this.settings = normalizeAudioSettings({
      ...this.settings,
      ...patch,
      initialized:
        patch.initialized === undefined
          ? this.settings.initialized
          : patch.initialized,
    });
    persistSettings(this.settings);
    if (this.settings.bgmMuted || this.settings.bgmVolume === 0) this.stopBgm(0);
    if (this.settings.sfxMuted || this.settings.sfxVolume === 0) this.stopAllSfx();
    if (this.settings.narrationMuted || this.settings.narrationVolume === 0) this.stopNarration();
    this.applyCurrentVolumes();

    for (const listener of this.listeners) {
      listener(this.getSettings());
    }
  }

  async primeManifest(): Promise<void> {
    await this.loadManifest();
  }

  async chooseInitialAudio(soundOn: boolean): Promise<void> {
    this.unlocked = true;
    this.updateSettings({
      initialized: true,
      bgmMuted: !soundOn,
      sfxMuted: !soundOn,
      narrationMuted: !soundOn,
    });

    if (soundOn) {
      await this.prefetchEssentialSfx();
    }
  }

  unlock(): void {
    this.unlocked = true;
  }

  async playBgm(assetId: string): Promise<boolean> {
    const ticket = ++this.bgmRequest;
    if (!this.canPlay("bgm")) return false;

    if (this.bgmAssetId === assetId && this.bgm && !this.bgm.paused) {
      this.applyCurrentVolumes();
      return true;
    }

    const asset = await this.findAsset(assetId, ["bgm"]);
    if (!asset || ticket !== this.bgmRequest || !this.canPlay("bgm")) return false;

    const next = new Audio(asset.path);
    next.loop = asset.loop !== false;
    next.preload = "auto";
    next.volume = 0;

    try {
      await next.play();
    } catch {
      next.src = "";
      return false;
    }

    if (ticket !== this.bgmRequest || !this.canPlay("bgm")) {
      next.pause(); next.src = "";
      return false;
    }
    const previous = this.bgm;
    this.bgm = next;
    this.bgmAsset = asset;
    this.bgmAssetId = assetId;

    this.fadeBgm(previous, next, 450);
    return true;
  }

  stopBgm(fadeMs = 240): void {
    this.bgmRequest += 1;
    const current = this.bgm;
    this.bgm = null;
    this.bgmAssetId = null;
    this.bgmAsset = null;

    if (!current) { this.fadeBgm(null, null, 0); return; }
    this.fadeBgm(current, null, fadeMs);
  }

  setDialogueDucking(active: boolean): void {
    this.dialogueDuck = active;
    this.applyCurrentVolumes();
  }

  async playSfx(assetId: string): Promise<() => void> {
    const ticket = this.sfxRequest;
    if (!this.canPlay("sfx")) return () => {};

    const asset = await this.findAsset(assetId, ["sfx", "stinger"]);
    if (!asset || ticket !== this.sfxRequest || !this.canPlay("sfx")) return () => {};

    const voiceLimit = this.settings.reducedSensory ? 2 : 4;
    while (this.sfxVoices.length >= voiceLimit) {
      const oldest = this.sfxVoices.shift();
      if (oldest) {
        this.sfxAssets.delete(oldest);
        oldest.pause();
        oldest.src = "";
      }
    }

    const voice = new Audio(asset.path);
    voice.preload = "auto";
    voice.volume = this.sfxTargetVolume(asset);
    this.sfxVoices.push(voice);
    this.sfxAssets.set(voice, asset);

    const cleanup = () => {
      const index = this.sfxVoices.indexOf(voice);
      if (index >= 0) this.sfxVoices.splice(index, 1);
      this.sfxAssets.delete(voice);
      voice.pause();
      voice.src = "";
    };

    voice.addEventListener("ended", cleanup, { once: true });
    voice.addEventListener("error", cleanup, { once: true });

    try {
      await voice.play();
    } catch {
      cleanup();
      return () => {};
    }

    if (ticket !== this.sfxRequest || !this.canPlay("sfx") || !this.sfxAssets.has(voice)) {
      cleanup();
      return () => {};
    }
    return cleanup;
  }

  stopAllSfx(): void {
    this.sfxRequest += 1;
    this.sfxAssets.clear();
    for (const voice of this.sfxVoices.splice(0)) {
      voice.pause();
      voice.src = "";
    }
  }

  async hasNarration(request: NarrationBinding): Promise<boolean> {
    return (await this.loadManifest()).assets.some((asset) => matchesNarration(asset, request));
  }

  async playNarration(request: NarrationBinding): Promise<boolean> {
    this.stopNarration();
    const ticket = this.narrationRequest;
    if (!this.canNarrate()) return false;
    const manifest = await this.loadManifest();
    if (ticket !== this.narrationRequest || !this.canNarrate()) return false;
    const asset = manifest.assets.find((candidate) => matchesNarration(candidate, request));
    if (!asset) return false;
    const voice = new Audio(asset.path);
    voice.preload = "auto";
    this.narration = voice;
    this.narrationAsset = asset;
    const cleanup = () => {
      if (this.narration === voice) this.stopNarration();
    };
    voice.addEventListener("ended", cleanup, { once: true });
    voice.addEventListener("error", cleanup, { once: true });
    this.applyCurrentVolumes();
    try {
      await voice.play();
      if (ticket !== this.narrationRequest) {
        voice.pause();
        voice.src = "";
        return false;
      }
      return true;
    } catch {
      cleanup();
      return false;
    }
  }

  stopNarration(): void {
    this.narrationRequest += 1;
    const voice = this.narration;
    this.narration = null;
    this.narrationAsset = null;
    if (voice) {
      voice.pause();
      voice.src = "";
    }
    this.applyCurrentVolumes();
  }

  private canPlay(channel: "bgm" | "sfx"): boolean {
    return canUseDom() && this.unlocked && this.settings.initialized && !document.hidden &&
      (channel === "bgm" ? !this.settings.bgmMuted && this.settings.bgmVolume > 0 :
        !this.settings.sfxMuted && this.settings.sfxVolume > 0);
  }

  private canNarrate(): boolean {
    return canUseDom() && this.unlocked && this.settings.initialized &&
      !this.settings.narrationMuted && this.settings.narrationVolume > 0 && !document.hidden;
  }

  private async loadManifest(): Promise<AudioManifest> {
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = fetch(MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok) return safeManifest(null);
        return safeManifest(await response.json());
      })
      .catch(() => safeManifest(null));

    return this.manifestPromise;
  }

  private async findAsset(
    assetId: string,
    kinds: Array<AudioManifestAsset["kind"]>,
  ): Promise<AudioManifestAsset | null> {
    const manifest = await this.loadManifest();
    const asset = manifest.assets.find(
      (candidate) =>
        candidate.id === assetId &&
        kinds.includes(candidate.kind) &&
        isApprovedRuntimeAsset(candidate),
    );

    return asset ?? null;
  }

  private async prefetchEssentialSfx(): Promise<void> {
    const manifest = await this.loadManifest();
    const essentials = manifest.assets.filter(
      (asset) =>
        asset.kind === "sfx" &&
        asset.preload === "essential" &&
        isApprovedRuntimeAsset(asset),
    );

    await Promise.all(
      essentials.map(async (asset) => {
        try {
          await fetch(asset.path, { cache: "force-cache" });
        } catch {
          // Offline or unsupported cache behavior must not block gameplay.
        }
      }),
    );
  }

  private bgmTargetVolume(): number {
    if (this.settings.bgmMuted) return 0;

    const duckFactor = (this.dialogueDuck || this.narration) ? 0.42 : 1;
    const sensoryFactor = this.settings.reducedSensory ? 0.72 : 1;
    const gain = Math.max(0, Math.min(1, this.bgmAsset?.defaultVolume ?? 1));
    return this.settings.bgmVolume * gain * duckFactor * sensoryFactor;
  }

  private sfxTargetVolume(asset: AudioManifestAsset): number {
    if (this.settings.sfxMuted) return 0;

    const assetVolume =
      typeof asset.defaultVolume === "number"
        ? Math.max(0, Math.min(1, asset.defaultVolume))
        : 1;
    const sensoryFactor = this.settings.reducedSensory ? 0.58 : 1;

    return this.settings.sfxVolume * assetVolume * sensoryFactor;
  }

  private applyCurrentVolumes(): void {
    if (this.narration && this.narrationAsset) {
      const gain = this.narrationAsset.defaultVolume ?? 1;
      this.narration.volume = this.settings.narrationVolume * Math.max(0, Math.min(1, gain));
    }
    if (this.bgm) {
      this.bgm.volume = this.bgmTargetVolume();
    }

    for (const voice of this.sfxVoices) {
      const asset = this.sfxAssets.get(voice);
      if (asset) voice.volume = this.sfxTargetVolume(asset);
    }
  }

  private fadeBgm(
    previous: HTMLAudioElement | null,
    next: HTMLAudioElement | null,
    durationMs: number,
  ): void {
    if (!canUseDom()) return;

    if (this.volumeAnimation !== null) {
      window.cancelAnimationFrame(this.volumeAnimation);
      this.volumeAnimation = null;
    }

    // A new transition cancels the outgoing track from the previous fade.
    if (this.fadingBgm && this.fadingBgm !== previous) {
      this.fadingBgm.pause(); this.fadingBgm.src = "";
    }
    this.fadingBgm = previous;
    if (durationMs <= 0) {
      if (previous) { previous.pause(); previous.src = ""; }
      if (next) next.volume = this.bgmTargetVolume();
      this.fadingBgm = null;
      return;
    }
    const startedAt = performance.now();
    const previousStart = previous?.volume ?? 0;


    const tick = (now: number) => {
      const progress =
        durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);

      if (previous) {
        previous.volume = previousStart * (1 - progress);
      }

      if (next) {
        next.volume = this.bgmTargetVolume() * progress;
      }

      if (progress < 1) {
        this.volumeAnimation = window.requestAnimationFrame(tick);
        return;
      }

      this.volumeAnimation = null;

      this.fadingBgm = null;
      if (previous) {
        previous.pause();
        previous.src = "";
      }
    };

    this.volumeAnimation = window.requestAnimationFrame(tick);
  }
}
