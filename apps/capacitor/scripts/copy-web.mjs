// Copies the denext static export of apps/web into www/ (Capacitor's webDir),
// skipping the precompressed *.gz siblings — the webview never asks for them and
// they would add ~13 MB to the app bundle. Then applies the production brand icons,
// as the hosted and desktop builds do, so the boot splash shows the production icon.
// Last, `denext ota manifest` stamps www/_denext/ota.json over the final files, so the app
// knows which UI it bundles (README "OTA UI updates").
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const appDir = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const source = NodePath.resolve(appDir, "../web/out");
const target = NodePath.resolve(appDir, "www");
const repoRoot = NodePath.resolve(appDir, "../..");
// The same denext CLI apps/web/deno.json pins for its tasks.
const DENEXT_CLI = "jsr:@denext/denext@2.7.1/cli";

if (!NodeFS.existsSync(NodePath.join(source, "index.html"))) {
  console.error(
    `copy-web: ${NodePath.join(source, "index.html")} not found — build the web app first: cd apps/web && deno task export`,
  );
  process.exit(1);
}

NodeFS.rmSync(target, { recursive: true, force: true });
NodeFS.mkdirSync(target, { recursive: true });

let files = 0;
let bytes = 0;

function copyDir(from, to) {
  for (const entry of NodeFS.readdirSync(from, { withFileTypes: true })) {
    const src = NodePath.join(from, entry.name);
    const dest = NodePath.join(to, entry.name);
    if (entry.isDirectory()) {
      NodeFS.mkdirSync(dest, { recursive: true });
      copyDir(src, dest);
    } else if (entry.isFile() && !entry.name.endsWith(".gz")) {
      NodeFS.copyFileSync(src, dest);
      files += 1;
      bytes += NodeFS.statSync(src).size;
    }
  }
}

copyDir(source, target);

console.log(
  `copy-web: copied ${files} files (${bytes} bytes, ${(bytes / 1024 / 1024).toFixed(1)} MB) from ${source} to ${target}`,
);

// The script resolves its target directory against the repo root.
NodeChildProcess.execFileSync(
  process.execPath,
  [
    NodePath.join(repoRoot, "scripts/apply-web-brand-assets.ts"),
    "production",
    NodePath.relative(repoRoot, target),
  ],
  { stdio: "inherit" },
);

// After the branding, so the version covers exactly the files the app ships. The server's
// export gets the same steps (README), so an unchanged UI is never downloaded again.
NodeChildProcess.execFileSync(
  "deno",
  ["run", "-A", "--node-modules-dir=none", DENEXT_CLI, "ota", "manifest", target],
  {
    stdio: "inherit",
  },
);
