import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIO_SETTINGS,
  isApprovedRuntimeAsset,
  normalizeAudioSettings,
} from "./audioTypes";

describe("audio settings and manifest guards", () => {
  it("normalizes invalid persisted volume values", () => {
    expect(
      normalizeAudioSettings({
        initialized: true,
        bgmVolume: 4,
        sfxVolume: -1,
      }),
    ).toEqual({
      ...DEFAULT_AUDIO_SETTINGS,
      initialized: true,
      bgmVolume: 1,
      sfxVolume: 0,
    });
  });

  it("accepts only approved same-origin audio paths", () => {
    expect(
      isApprovedRuntimeAsset({
        id: "SFX-01",
        kind: "sfx",
        path: "/audio/sfx/sfx_ui_tap_v1.mp3",
        approved: true,
      }),
    ).toBe(true);

    expect(
      isApprovedRuntimeAsset({
        id: "SFX-01",
        kind: "sfx",
        path: "https://example.com/sfx.mp3",
        approved: true,
      }),
    ).toBe(false);

    expect(
      isApprovedRuntimeAsset({
        id: "SFX-01",
        kind: "sfx",
        path: "/audio/sfx/candidate.mp3",
        approved: false,
      }),
    ).toBe(false);
  });
});
