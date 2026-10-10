// The Deno Desktop build runs apps/server as a denext sidecar (denext.config.ts `desktop.sidecars`,
// desktop.ts). This module is the part both sides share: the Deno host makes the per-launch
// secrets, and the window's preload (desktop/preload.ts) reads the token it presents. Web standards
// only (WebCrypto), so it loads in Deno, the window and Vitest alike.

/** The sidecar's name in `desktop.sidecars`. */
export const SERVER_SIDECAR_NAME = "server";

/** The `expose` key under which `sidecarInfo("server")` hands the window its bootstrap token. */
export const SERVER_SIDECAR_TOKEN_KEY = "bootstrapToken";

/** The secret names apps/server/src/desktopSidecar.ts reads. */
export const SERVER_SIDECAR_SECRET_NAMES = {
  secret: "BOOTSTRAP_SECRET",
  token: "BOOTSTRAP_TOKEN",
} as const;

/** `DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS` of `@t3tools/shared/desktopBootstrapToken`. */
const TOKEN_WINDOW_MS = 12 * 60 * 60 * 1000;

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/**
 * The bootstrap token for `nowMs`, as `currentDesktopBootstrapToken` derives it (HMAC-SHA256 of
 * the time window under the secret), with WebCrypto in place of `node:crypto`.
 */
export async function deriveDesktopBootstrapToken(secret: string, nowMs: number): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const window = Math.floor(nowMs / TOKEN_WINDOW_MS);
  return hex(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`t3-desktop-bootstrap:${window}`)),
  );
}

/**
 * The sidecar's secrets for one launch of the app: a fresh secret (as apps/desktop makes one per
 * run) and the token derived from it now. The server accepts the token for the rest of its time
 * window and the next one (12 to 24 hours); the window only needs it to mint its bearer.
 */
export async function serverSidecarSecrets(
  nowMs: number = Date.now(),
): Promise<Record<string, string>> {
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  return {
    [SERVER_SIDECAR_SECRET_NAMES.secret]: secret,
    [SERVER_SIDECAR_SECRET_NAMES.token]: await deriveDesktopBootstrapToken(secret, nowMs),
  };
}

/** The bootstrap token in a `sidecarInfo` answer, if it carries one. */
export function sidecarBootstrapToken(info: unknown): string | undefined {
  if (typeof info !== "object" || info === null) return undefined;
  const values = (info as { readonly values?: unknown }).values;
  if (typeof values !== "object" || values === null) return undefined;
  const token = (values as Record<string, unknown>)[SERVER_SIDECAR_TOKEN_KEY];
  return typeof token === "string" && token.length > 0 ? token : undefined;
}
