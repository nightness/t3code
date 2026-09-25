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

/** A string store for the native shell's small secrets (the Clerk client token, the device id). */
export interface NativeSecretStore {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

const localStorageSecretStore: NativeSecretStore = {
  get: async (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage off: the value lasts until the app closes at most.
    }
  },
  remove: async (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing stored.
    }
  },
};

/**
 * The iOS Keychain through the T3Native plugin (one generic-password item per key), else
 * `localStorage` for a shell without the plugin (the Android shell today). A Keychain failure
 * rejects; a missing item reads as null.
 */
export function nativeSecretStore(): NativeSecretStore {
  const { keychainGet, keychainSet, keychainRemove } = nativeT3Plugin() ?? {};
  if (!keychainGet || !keychainSet || !keychainRemove) return localStorageSecretStore;
  return {
    get: async (key) => (await keychainGet({ key }))?.value ?? null,
    set: async (key, value) => {
      await keychainSet({ key, value });
    },
    remove: async (key) => {
      await keychainRemove({ key });
    },
  };
}

const EXTERNAL_URL_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Opens `url` in the system browser (or mail / phone app) from the native shell and returns
 * true; returns false, doing nothing, anywhere else or for a URL it will not hand over, so the
 * caller keeps its own path. The iOS WKWebView silently blocks a `window.open` that does not run
 * inside the tap (after an `await`, say), because Capacitor leaves
 * `javaScriptCanOpenWindowsAutomatically` off. A top-level navigation to anything but the app's
 * own URL needs no gesture: Capacitor's `decidePolicyFor` cancels it and passes the URL to
 * `UIApplication.shared.open`, and Android's `shouldOverrideUrlLoading` launches an intent.
 * Only absolute http(s)/mailto/tel URLs qualify. A relative URL, `javascript:`, `data:`, `blob:`
 * and the app's own origin (which would load in place of the app) are refused.
 */
export function openExternalUrl(url: string): boolean {
  if (!isNativeShell()) return false;
  let target: URL;
  try {
    // No base URL, so anything relative throws and stays with the caller.
    target = new URL(url);
  } catch {
    return false;
  }
  if (!EXTERNAL_URL_PROTOCOLS.has(target.protocol)) return false;
  const { location } = window;
  const isWeb = target.protocol === "http:" || target.protocol === "https:";
  if (isWeb && target.origin === location.origin) return false;
  location.assign(target.href);
  return true;
}
