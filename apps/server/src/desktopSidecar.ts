// @effect-diagnostics nodeBuiltinImport:off
// Runs before any Effect runtime is built (see ./desktop-sidecar.ts), so it stays on Node built-ins.
import * as NodeOS from "node:os";

import type { DesktopBackendBootstrap } from "@t3tools/contracts";

/**
 * The server as a sidecar of the Deno Desktop build of T3 Code (apps/web's
 * `desktop.sidecars`). denext runs `desktop-sidecar.mjs` in a worker of the
 * app's own runtime and hands it `globalThis.denextSidecar`; this module turns
 * that into what apps/desktop's DesktopBackendManager gives the Electron
 * backend: the bootstrap envelope (on fd 3 there, in process here), a
 * scrubbed environment and the home directory as the working directory.
 */

/** What denext gives a module sidecar (`globalThis.denextSidecar`). */
export interface DenextSidecarContext {
  readonly name: string;
  readonly port?: number;
  readonly bootstrap: unknown;
  readonly secrets: Readonly<Record<string, string>>;
  readonly ready: () => void;
  readonly onShutdown: (handler: () => unknown) => void;
}

/**
 * The sidecar's secrets (apps/web/desktop.ts makes them once per launch): the
 * secret the bootstrap tokens derive from, and the token the window presents.
 */
export const DESKTOP_SIDECAR_BOOTSTRAP_SECRET = "BOOTSTRAP_SECRET";
export const DESKTOP_SIDECAR_BOOTSTRAP_TOKEN = "BOOTSTRAP_TOKEN";

/**
 * Variables the desktop app owns for its backend. As apps/desktop's
 * DesktopBackendConfiguration does, they are dropped from the backend's
 * environment so a value inherited from the user's shell cannot override the
 * envelope (the server reads variables before the envelope).
 */
export const DESKTOP_SIDECAR_SCRUBBED_ENV_NAMES = [
  "T3CODE_PORT",
  "T3CODE_MODE",
  "T3CODE_NO_BROWSER",
  "T3CODE_HOST",
  "T3CODE_BOOTSTRAP_FD",
  "T3CODE_DESKTOP_WS_URL",
  "T3CODE_DESKTOP_LAN_ACCESS",
  "T3CODE_DESKTOP_LAN_HOST",
  "T3CODE_DESKTOP_HTTPS_ENDPOINTS",
  "T3CODE_TAILSCALE_SERVE",
  "T3CODE_TAILSCALE_SERVE_PORT",
] as const;

/**
 * What children spawn to run this install's CLI (`resolveSelfInvocation`).
 * Inside the app `process.execPath` is the app binary, which would open
 * another window rather than run a subcommand, so a Node on PATH is named
 * instead.
 */
export const DESKTOP_SIDECAR_EXEC_PATH = "node";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** The sidecar context when this module runs as a denext sidecar, else undefined. */
export function readDenextSidecar(
  scope: { readonly denextSidecar?: unknown } = globalThis as { readonly denextSidecar?: unknown },
): DenextSidecarContext | undefined {
  const sidecar = scope.denextSidecar;
  if (!isRecord(sidecar) || typeof sidecar.name !== "string" || !isRecord(sidecar.secrets)) {
    return undefined;
  }
  return sidecar as unknown as DenextSidecarContext;
}

/** The envelope apps/desktop sends on fd 3, built from the sidecar's port and secrets. */
export function desktopSidecarBootstrap(sidecar: DenextSidecarContext): DesktopBackendBootstrap {
  const secret = sidecar.secrets[DESKTOP_SIDECAR_BOOTSTRAP_SECRET];
  const token = sidecar.secrets[DESKTOP_SIDECAR_BOOTSTRAP_TOKEN];
  if (sidecar.port === undefined) {
    throw new Error(`Sidecar "${sidecar.name}" has no port: declare port: "auto".`);
  }
  if (!secret || !token) {
    throw new Error(
      `Sidecar "${sidecar.name}" is missing its ${DESKTOP_SIDECAR_BOOTSTRAP_SECRET} / ${DESKTOP_SIDECAR_BOOTSTRAP_TOKEN} secrets.`,
    );
  }
  return {
    mode: "desktop",
    noBrowser: true,
    port: sidecar.port,
    host: "127.0.0.1",
    desktopBootstrapToken: token,
    desktopBootstrapSecret: secret,
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  };
}

/** The parts of `process` the sidecar adjusts (the worker's own copy, not the app's). */
export interface DesktopSidecarProcess {
  argv: string[];
  env: Record<string, string | undefined>;
}

/**
 * Make the worker's process look like apps/desktop's backend child: the
 * desktop-owned variables gone, and the home directory as the
 * working-directory argument when none is given (the app's own cwd is `/` on
 * macOS). The exec path children relaunch is `runCli`'s to set
 * ({@link DESKTOP_SIDECAR_EXEC_PATH}): Deno's `process.execPath` is read-only.
 */
export function prepareDesktopSidecarProcess(
  proc: DesktopSidecarProcess,
  homeDirectory: string = NodeOS.homedir(),
): void {
  for (const name of DESKTOP_SIDECAR_SCRUBBED_ENV_NAMES) delete proc.env[name];
  if (proc.argv.length <= 2) proc.argv = [...proc.argv.slice(0, 2), homeDirectory];
}
