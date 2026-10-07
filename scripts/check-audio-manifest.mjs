import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(
  root,
  "apps/web/public/audio/audio_manifest.json",
);

function fail(message) {
  console.error(`AUDIO_MANIFEST_ERROR: ${message}`);
  process.exitCode = 1;
}

if (!existsSync(manifestPath)) {
  fail("audio_manifest.json is missing");
} else {
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest) {
    if (!Array.isArray(manifest.assets)) {
      fail("assets must be an array");
    } else {
      const ids = new Set();

      for (const [index, asset] of manifest.assets.entries()) {
        const prefix = `assets[${index}]`;

        if (!asset || typeof asset !== "object") {
          fail(`${prefix} must be an object`);
          continue;
        }

        if (typeof asset.id !== "string" || asset.id.length === 0) {
          fail(`${prefix}.id is required`);
        } else if (ids.has(asset.id)) {
          fail(`duplicate asset id: ${asset.id}`);
        } else {
          ids.add(asset.id);
        }

        if (!["bgm", "sfx", "stinger"].includes(asset.kind)) {
          fail(`${prefix}.kind must be bgm, sfx, or stinger`);
        }

        if (
          typeof asset.path !== "string" ||
          !asset.path.startsWith("/audio/") ||
          asset.path.includes("..")
        ) {
          fail(`${prefix}.path must be a safe /audio/ same-origin path`);
        }

        if (typeof asset.approved !== "boolean") {
          fail(`${prefix}.approved must be boolean`);
        }

        if (
          asset.defaultVolume !== undefined &&
          (typeof asset.defaultVolume !== "number" ||
            asset.defaultVolume < 0 ||
            asset.defaultVolume > 1)
        ) {
          fail(`${prefix}.defaultVolume must be between 0 and 1`);
        }

        if (
          asset.preload !== undefined &&
          !["essential", "scene", "none"].includes(asset.preload)
        ) {
          fail(`${prefix}.preload is invalid`);
        }

        if (asset.kind === "bgm" && asset.preload === "essential") {
          fail(`${prefix}: BGM must not use essential preload`);
        }

        if (typeof asset.path === "string" && asset.path.startsWith("/audio/")) {
          const relative = asset.path.replace(/^\//u, "");
          const filePath = resolve(root, "apps/web/public", relative);

          if (asset.approved === true && !existsSync(filePath)) {
            fail(`${prefix}: approved file is missing: ${asset.path}`);
          }
        }

        if (asset.approved === true) {
          const provenance = asset.provenance;

          if (!provenance || typeof provenance !== "object") {
            fail(`${prefix}: approved asset requires provenance`);
            continue;
          }

          for (const field of [
            "tool",
            "model",
            "promptHash",
            "generatedAt",
            "licenseReviewedBy",
            "hfReviewedBy",
            "technicalReviewedBy",
          ]) {
            if (
              typeof provenance[field] !== "string" ||
              provenance[field].trim().length === 0
            ) {
              fail(`${prefix}.provenance.${field} is required for approved assets`);
            }
          }
        }
      }

      if (!process.exitCode) {
        console.log(
          `AUDIO_MANIFEST_PASS assets=${manifest.assets.length} approved=${
            manifest.assets.filter((asset) => asset?.approved === true).length
          }`,
        );
      }
    }
  }
}
