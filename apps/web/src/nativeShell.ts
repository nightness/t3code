/**
 * The app-local `T3Native` Capacitor plugin (apps/capacitor/ios/App/App/T3NativePlugin.swift).
 * Capacitor's native side injects a method stub per declared plugin method onto
 * `window.Capacitor.Plugins.T3Native` before any page script runs, so the web app reaches it
 * without bundling @capacitor/core. Every method is optional: the Android shell has no native
 * plugin yet, and an older iOS build may predate a method.
 */
export interface NativeT3Plugin {
  readonly keychainGet?: (options: { readonly key: string }) => Promise<{
    readonly value?: string | null;
  }>;
  readonly keychainSet?: (options: {
    readonly key: string;
    readonly value: string;
  }) => Promise<unknown>;
  readonly keychainRemove?: (options: { readonly key: string }) => Promise<unknown>;
  /**
   * Rejects with `code: "cancelled"` when the user closes the scanner and
   * `code: "denied"` when camera access is off.
   */
  readonly scanQRCode?: () => Promise<{ readonly value: string }>;
}

interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly Plugins?: { readonly T3Native?: NativeT3Plugin };
}

function capacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/**
 * True inside the Capacitor iOS/Android shell (apps/capacitor). Capacitor's
 * native bridge defines window.Capacitor before any page script runs, so this
 * is reliable at module load time without importing @capacitor/core. The page
 * origin there (capacitor://localhost, https://localhost) has no T3 server
 * behind it, so the shell runs as a hosted static app that pairs with remote
 * environments.
 */
export function isNativeShell(): boolean {
  return capacitorGlobal()?.isNativePlatform?.() === true;
}

/**
 * The `T3Native` plugin when running inside the native shell and the shell registered it,
 * otherwise undefined. Callers still check the specific method they need.
 */
export function nativeT3Plugin(): NativeT3Plugin | undefined {
  if (!isNativeShell()) return undefined;
  const plugin = capacitorGlobal()?.Plugins?.T3Native;
  return typeof plugin === "object" && plugin !== null ? plugin : undefined;
}
