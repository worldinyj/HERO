import {
  DEFAULT_AUDIO_SETTINGS,
  isApprovedRuntimeAsset,
  normalizeAudioSettings,
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
  private dialogueDuck = false;
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
    });

    if (soundOn) {
      await this.prefetchEssentialSfx();
    }
  }

  unlock(): void {
    this.unlocked = true;
  }

  async playBgm(assetId: string): Promise<boolean> {
    if (
      !canUseDom() ||
      !this.unlocked ||
      !this.settings.initialized ||
      this.settings.bgmMuted
    ) {
      return false;
    }

    if (this.bgmAssetId === assetId && this.bgm && !this.bgm.paused) {
      this.applyCurrentVolumes();
      return true;
    }

    const asset = await this.findAsset(assetId, ["bgm"]);
    if (!asset) return false;

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

    const previous = this.bgm;
    this.bgm = next;
    this.bgmAssetId = assetId;

    this.fadeBgm(previous, next, 450);
    return true;
  }

  stopBgm(fadeMs = 240): void {
    const current = this.bgm;
    this.bgm = null;
    this.bgmAssetId = null;

    if (!current) return;
    this.fadeBgm(current, null, fadeMs);
  }

  setDialogueDucking(active: boolean): void {
    this.dialogueDuck = active;
    this.applyCurrentVolumes();
  }

  async playSfx(assetId: string): Promise<() => void> {
    if (
      !canUseDom() ||
      !this.unlocked ||
      !this.settings.initialized ||
      this.settings.sfxMuted
    ) {
      return () => {};
    }

    const asset = await this.findAsset(assetId, ["sfx", "stinger"]);
    if (!asset) return () => {};

    const voiceLimit = this.settings.reducedSensory ? 2 : 4;
    while (this.sfxVoices.length >= voiceLimit) {
      const oldest = this.sfxVoices.shift();
      if (oldest) {
        oldest.pause();
        oldest.src = "";
      }
    }

    const voice = new Audio(asset.path);
    voice.preload = "auto";
    voice.volume = this.sfxTargetVolume(asset);
    this.sfxVoices.push(voice);

    const cleanup = () => {
      const index = this.sfxVoices.indexOf(voice);
      if (index >= 0) this.sfxVoices.splice(index, 1);
      voice.pause();
      voice.src = "";
    };

    voice.addEventListener("ended", cleanup, { once: true });

    try {
      await voice.play();
    } catch {
      cleanup();
      return () => {};
    }

    return cleanup;
  }

  stopAllSfx(): void {
    for (const voice of this.sfxVoices.splice(0)) {
      voice.pause();
      voice.src = "";
    }
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

    const duckFactor = this.dialogueDuck ? 0.42 : 1;
    const sensoryFactor = this.settings.reducedSensory ? 0.72 : 1;
    return this.settings.bgmVolume * duckFactor * sensoryFactor;
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
    if (this.bgm) {
      this.bgm.volume = this.bgmTargetVolume();
    }

    for (const voice of this.sfxVoices) {
      voice.volume = this.settings.sfxMuted
        ? 0
        : this.settings.sfxVolume *
          (this.settings.reducedSensory ? 0.58 : 1);
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

    const startedAt = performance.now();
    const previousStart = previous?.volume ?? 0;
    const nextTarget = next ? this.bgmTargetVolume() : 0;

    const tick = (now: number) => {
      const progress =
        durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);

      if (previous) {
        previous.volume = previousStart * (1 - progress);
      }

      if (next) {
        next.volume = nextTarget * progress;
      }

      if (progress < 1) {
        this.volumeAnimation = window.requestAnimationFrame(tick);
        return;
      }

      this.volumeAnimation = null;

      if (previous) {
        previous.pause();
        previous.src = "";
      }
    };

    this.volumeAnimation = window.requestAnimationFrame(tick);
  }
}
