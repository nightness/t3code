/** Which managed-auth (Clerk) shell a runtime loads. */
export type ManagedAuthShellKind = "electron" | "capacitor" | "browser";

/**
 * The Electron app and the Capacitor shell each get their own Clerk runtime; everything else gets
 * the hotloaded browser one, as upstream. The denext desktop build (`deno desktop`) counts as
 * Electron: its preload (apps/web/desktop/preload.ts) sets `window.desktopBridge` and the
 * `@clerk/electron` bridge globals, so it runs the Electron shell with native passkeys. A window
 * without that preload (the stock Deno Desktop runtime) is a browser.
 */
export function selectManagedAuthShell(runtime: {
  readonly isElectron: boolean;
  readonly isNativeShell: boolean;
  readonly platform: "ios" | "android" | "desktop" | "web";
}): ManagedAuthShellKind {
  if (runtime.isElectron) return "electron";
  if (runtime.isNativeShell) return "capacitor";
  return "browser";
}
