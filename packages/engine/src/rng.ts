function hash32(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function mulberry32(seed: number): number {
  let value = seed + 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function seededUnit(seed: string, counter = 0): number {
  return mulberry32(hash32(`${seed}:${counter}`));
}

export function seededOrderKey(seed: string, stableId: string): number {
  return seededUnit(`${seed}:${stableId}`, 0);
}
