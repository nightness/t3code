// Copies the denext static export of apps/web into www/ (Capacitor's webDir),
// skipping the precompressed *.gz siblings — the webview never asks for them and
// they would add ~13 MB to the app bundle. Then applies the production brand icons,
// as the hosted and desktop builds do, so the boot splash shows the production icon.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(appDir, "../web/out");
const target = resolve(appDir, "www");
const repoRoot = resolve(appDir, "../..");

if (!existsSync(join(source, "index.html"))) {
  console.error(
    `copy-web: ${join(source, "index.html")} not found — build the web app first: cd apps/web && deno task export`,
  );
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let files = 0;
let bytes = 0;

function copyDir(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      copyDir(src, dest);
    } else if (entry.isFile() && !entry.name.endsWith(".gz")) {
      copyFileSync(src, dest);
      files += 1;
      bytes += statSync(src).size;
    }
  }
}

copyDir(source, target);

console.log(
  `copy-web: copied ${files} files (${bytes} bytes, ${(bytes / 1024 / 1024).toFixed(1)} MB) from ${source} to ${target}`,
);

// The script resolves its target directory against the repo root.
execFileSync(
  process.execPath,
  [join(repoRoot, "scripts/apply-web-brand-assets.ts"), "production", relative(repoRoot, target)],
  { stdio: "inherit" },
);
