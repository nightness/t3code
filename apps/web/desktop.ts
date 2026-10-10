// Entry for `deno desktop` — serves the static export in `out/` inside a native window (run
// `deno task export` first, or `deno task desktop`, which exports then launches the window).
// The serve + window plumbing lives in denext's desktop runtime; pass `import.meta.url` so `out/`
// resolves relative to this entry (works from the packaged app too).
//
// Native capabilities come from `desktop.capabilities` in denext.config.ts (default deny), the
// backend reverse proxy from `spa.proxy`. Both arrive through `.deno-desktop/config.json`, the
// runtime part of denext.config.ts that every export, build and `denext desktop` command rewrites:
// the config is evaluated when the app is BUILT, so build-time choices (T3_DESKTOP_SERVER, see
// src/desktopServerMode.ts) are baked in and the packaged app never re-reads the environment.
import config from "./.deno-desktop/config.json" with { type: "json" };
import { defineSidecar, resolveDesktopCapabilities, runDesktop } from "denext/desktop";
import {
  SERVER_SIDECAR_NAME,
  SERVER_SIDECAR_SECRET_NAMES,
  SERVER_SIDECAR_TOKEN_KEY,
  serverSidecarSecrets,
} from "./src/desktopServerSidecar.ts";

const desktop = await resolveDesktopCapabilities(config, { base: import.meta.url });

await runDesktop({
  importMetaUrl: import.meta.url,
  ...desktop,
  // The `server` sidecar is declared in denext.config.ts (and absent in external mode, where this
  // list is empty); its secrets are code: a fresh bootstrap secret per launch and the token
  // derived from it (apps/desktop does the same), the token exposed to the window. An entry here
  // replaces the config's field by field.
  sidecars: desktop.configSidecars
    .filter((sidecar) => sidecar.name === SERVER_SIDECAR_NAME)
    .map((sidecar) =>
      defineSidecar({
        ...sidecar,
        secrets: () => serverSidecarSecrets(),
        expose: { [SERVER_SIDECAR_TOKEN_KEY]: `$secret:${SERVER_SIDECAR_SECRET_NAMES.token}` },
      }),
    ),
});
