export type AudioAssetKind = "bgm" | "sfx" | "stinger" | "narration";

export interface NarrationBinding {
  scenarioId: string;
  scenarioVersion: number;
  nodeId: string;
  field: "text" | "prompt" | "revealText" | "summary";
  actionId?: string;
  text: string;
}

export interface AudioManifestAsset {
  id: string;
  kind: AudioAssetKind;
  path: string;
  approved: boolean;
  narration?: NarrationBinding;
  loop?: boolean;
  defaultVolume?: number;
  preload?: "essential" | "scene" | "none";
}

export interface AudioManifest {
  version: string;
  project: string;
  assets: AudioManifestAsset[];
}

export interface AudioSettings {
  initialized: boolean;
  bgmMuted: boolean;
  bgmVolume: number;
  narrationMuted: boolean;
  narrationVolume: number;
  sfxMuted: boolean;
  sfxVolume: number;
  reducedSensory: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  initialized: false,
  bgmMuted: false,
  bgmVolume: 0.45,
  narrationMuted: false,
  narrationVolume: 0.8,
  sfxMuted: false,
  sfxVolume: 0.7,
  reducedSensory: false,
};

export function clampAudioVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export function normalizeAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }

  const source = value as Partial<AudioSettings>;

  return {
    initialized: source.initialized === true,
    bgmMuted: source.bgmMuted === true,
    bgmVolume: clampAudioVolume(
      source.bgmVolume,
      DEFAULT_AUDIO_SETTINGS.bgmVolume,
    ),
    narrationMuted: source.narrationMuted === undefined
      ? source.bgmMuted === true && source.sfxMuted === true
      : source.narrationMuted === true,
    narrationVolume: clampAudioVolume(source.narrationVolume, DEFAULT_AUDIO_SETTINGS.narrationVolume),
    sfxMuted: source.sfxMuted === true,
    sfxVolume: clampAudioVolume(
      source.sfxVolume,
      DEFAULT_AUDIO_SETTINGS.sfxVolume,
    ),
    reducedSensory: source.reducedSensory === true,
  };
}

export function isApprovedRuntimeAsset(
  asset: AudioManifestAsset,
): boolean {
  return (
    asset.approved === true &&
    (asset.kind === "bgm" ||
      asset.kind === "sfx" ||
      asset.kind === "stinger" ||
      asset.kind === "narration") &&
    asset.path.startsWith("/audio/") &&
    !asset.path.includes("..")
  );
}

export function matchesNarration(asset: AudioManifestAsset, request: NarrationBinding): boolean {
  const binding = asset.narration;
  return asset.kind === "narration" && isApprovedRuntimeAsset(asset) && !!binding &&
    binding.scenarioId === request.scenarioId && binding.scenarioVersion === request.scenarioVersion &&
    binding.nodeId === request.nodeId && binding.field === request.field &&
    binding.actionId === request.actionId && binding.text === request.text;
}
