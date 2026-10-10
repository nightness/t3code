// Web build only (denext React Native mode): what Metro's config and Expo's native build do
// before a bundle, for `deno task export` / `dev` (deno.json `web:prepare`).
//   1. metro.config.js's generated modules (.generated/: third-party licenses, the device and
//      preview stream scripts), which deno.json "imports" maps the extraNodeModules names to.
//   2. uniwind's artifacts (node_modules/uniwind/uniwind.css) for the app's themes, as
//      withUniwindConfig does on every Metro start.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(app, "package.json"));
process.chdir(app);

// 1. Requiring metro.config.js runs its generators; its export is a promise of the config.
await require("./metro.config.js");

// 2.
const themes = JSON.parse(readFileSync("generated-uniwind-theme-names.json", "utf8"));
const uniwindCli = join(dirname(require.resolve("uniwind/package.json")), "dist/cli/index.mjs");
execFileSync(
  process.execPath,
  [
    uniwindCli,
    "generate-artifacts",
    "--css",
    "./global.css",
    ...themes.flatMap((t) => ["--theme", t]),
  ],
  { stdio: "inherit" },
);

// metro.config.js keeps fs watchers open outside production; this is a one-shot step.
process.exit(0);
