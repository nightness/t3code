// Which T3 server the Deno Desktop build talks to, chosen when the app is built (read by
// denext.config.ts, and from there baked into the packaged app's `.deno-desktop/config.json`):
//
// - "sidecar" (the default): the app runs its own server as the `server` sidecar
//   (denext.config.ts `desktop.sidecars`) on a free loopback port.
// - "external": the app starts no server and connects to one that is already running, by default
//   the `t3 serve` on 127.0.0.1:3773. Two servers on one ~/.t3 share one database with no lock, so
//   a machine that keeps a server running for its phone builds the desktop app this way.
//
//   T3_DESKTOP_SERVER=external deno task desktop:package
//   T3_DESKTOP_SERVER=external T3_DESKTOP_SERVER_URL=http://127.0.0.1:4000 deno task desktop:package
//
// Pure functions of an env map, so the config, the tests and any tooling share one reading.

export type DesktopServerMode = "sidecar" | "external";

/** The env var that selects the mode: `sidecar` (default) or `external`. */
export const DESKTOP_SERVER_ENV = "T3_DESKTOP_SERVER";

/** The env var naming the external server's origin (external mode only). */
export const DESKTOP_SERVER_URL_ENV = "T3_DESKTOP_SERVER_URL";

/** The server `t3 serve` leaves running. */
export const DEFAULT_EXTERNAL_SERVER_URL = "http://127.0.0.1:3773";

type Env = Readonly<Record<string, string | undefined>>;

/** The mode `env` selects; an unknown value throws rather than silently picking one. */
export function desktopServerMode(env: Env): DesktopServerMode {
  const raw = env[DESKTOP_SERVER_ENV]?.trim().toLowerCase();
  if (raw === undefined || raw === "" || raw === "sidecar") return "sidecar";
  if (raw === "external") return "external";
  throw new Error(`${DESKTOP_SERVER_ENV} must be "sidecar" or "external", got "${raw}"`);
}

/** The external server's origin: `T3_DESKTOP_SERVER_URL`, else {@link DEFAULT_EXTERNAL_SERVER_URL}. */
export function externalServerUrl(env: Env): string {
  const raw = env[DESKTOP_SERVER_URL_ENV]?.trim() || DEFAULT_EXTERNAL_SERVER_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${DESKTOP_SERVER_URL_ENV} is not a URL: "${raw}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${DESKTOP_SERVER_URL_ENV} must be an http(s) URL, got "${raw}"`);
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    throw new Error(`${DESKTOP_SERVER_URL_ENV} must be an origin without a path, got "${raw}"`);
  }
  return url.origin;
}

/** Whether the proxy needs `allowNonLoopback` for `target` (denext proxies loopback by default). */
export function isLoopbackUrl(target: string): boolean {
  const host = new URL(target).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** The `spa.proxy` fields the selection decides (denext.config.ts spreads them next to `prefixes`). */
export function desktopServerProxy(selection: {
  readonly proxyTarget: string;
  readonly proxyAllowNonLoopback: boolean;
}): { readonly target: string; readonly allowNonLoopback?: true } {
  return {
    target: selection.proxyTarget,
    ...(selection.proxyAllowNonLoopback ? { allowNonLoopback: true as const } : {}),
  };
}

/**
 * What the mode changes in the denext config: the `spa.proxy` target, and whether the `server`
 * sidecar is declared.
 */
export function desktopServerSelection(env: Env): {
  readonly mode: DesktopServerMode;
  readonly proxyTarget: string;
  readonly proxyAllowNonLoopback: boolean;
  readonly sidecar: boolean;
} {
  const mode = desktopServerMode(env);
  if (mode === "sidecar") {
    // The sidecar's `proxy: true` replaces this target with its own port; it is what a browser on
    // `deno task dev` reaches (a server started by hand).
    return {
      mode,
      proxyTarget: DEFAULT_EXTERNAL_SERVER_URL,
      proxyAllowNonLoopback: false,
      sidecar: true,
    };
  }
  const proxyTarget = externalServerUrl(env);
  return { mode, proxyTarget, proxyAllowNonLoopback: !isLoopbackUrl(proxyTarget), sidecar: false };
}
