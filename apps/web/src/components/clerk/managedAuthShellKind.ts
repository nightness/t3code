/** Which managed-auth (Clerk) shell a runtime loads, or null for none. */
export type ManagedAuthShellKind = "electron" | "capacitor" | "browser";

/**
 * The Electron app and the Capacitor shell each get their own Clerk runtime, and a plain browser
 * the hotloaded one. The denext desktop build (`deno desktop`) shares the Capacitor shell's export
 * but gets none: the browser Clerk shell is untested in its webview, so it keeps local mode.
 */
export function selectManagedAuthShell(runtime: {
  readonly isElectron: boolean;
  readonly isNativeShell: boolean;
  readonly platform: "ios" | "android" | "desktop" | "web";
}): ManagedAuthShellKind | null {
  if (runtime.isElectron) return "electron";
  if (runtime.isNativeShell) return "capacitor";
  if (runtime.platform === "desktop") return null;
  return "browser";
}
