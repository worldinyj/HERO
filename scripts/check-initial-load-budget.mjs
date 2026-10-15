import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

const dist = process.argv.find(arg => arg.startsWith('--dist='))?.slice(7) ?? 'apps/web/dist';
const manifest = JSON.parse(readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const visited = new Set();
const scripts = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  assert.ok(chunk, `Missing build manifest entry: ${key}`);
  if (chunk.file.endsWith('.js')) scripts.add(chunk.file);
  // Only static dependencies are needed for initial paint. Gameplay is lazy.
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
visit('index.html');
let decodedBytes = 0;
let gzipBytes = 0;
for (const file of scripts) {
  const bytes = readFileSync(path.join(dist, file));
  decodedBytes += bytes.length;
  gzipBytes += gzipSync(bytes).length;
}
const report = {decodedBytes, gzipBytes, scripts: [...scripts], limits: {decodedBytes: 510 * 1024, gzipBytes: 150 * 1024}};
console.log(JSON.stringify(report, null, 2));
assert.ok(decodedBytes <= report.limits.decodedBytes, 'Initial JS exceeds 510 KiB; keep validation, gameplay and participant queue behind lazy loading');
assert.ok(gzipBytes <= report.limits.gzipBytes, 'Initial gzipped JS exceeds 150 KiB');
console.log('INITIAL_LOAD_BUDGET_PASS (build size check, not an LCP measurement)');
