/** Which managed-auth (Clerk) shell a runtime loads. */
export type ManagedAuthShellKind = "electron" | "capacitor" | "browser";

/**
 * The Electron app and the Capacitor shell each get their own Clerk runtime; everything else, the
 * denext desktop build (`deno desktop`) included, gets the hotloaded browser one, as upstream.
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
