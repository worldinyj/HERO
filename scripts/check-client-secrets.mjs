import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(process.cwd());
const scanRoots = [
  resolve(root, "apps/web/src"),
  resolve(root, "apps/web/public"),
  resolve(root, "apps/web/dist"),
];

const forbidden = [
  { label: "Supabase service-role env name", pattern: /SUPABASE_SERVICE_ROLE_KEY/giu },
  { label: "Supabase service_role token marker", pattern: /service_role/giu },
  { label: "Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]+/gu },
];

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".map",
  ".mjs",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".webmanifest",
]);

function extension(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index) : "";
}

function walk(path) {
  if (!statSync(path).isDirectory()) return [path];

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    return entry.isDirectory() ? walk(next) : [next];
  });
}

const findings = [];

for (const scanRoot of scanRoots) {
  let files = [];
  try {
    files = walk(scanRoot);
  } catch {
    continue;
  }

  for (const file of files) {
    if (!textExtensions.has(extension(file))) continue;

    const content = readFileSync(file, "utf8");

    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(content)) {
        findings.push({
          file: relative(root, file),
          label: rule.label,
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Client secret guard failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label}`);
  }
  process.exit(1);
}

console.log("Client secret guard PASS");
