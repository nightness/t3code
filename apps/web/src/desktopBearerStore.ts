// Where the Deno Desktop window keeps the bearer it mints for the local environment
// (desktop/preload.ts). The keychain (denext `secureStore`) is the place: it outlives the app. A
// session without one (Linux with no Secret Service, or a keyring that stays locked) refuses, and
// the bearer is then kept in the window's session storage instead, which outlives the reload that
// follows pairing but not the app: the next launch exchanges the sidecar's token again. Without
// this fallback such a session never signs in ("Timed out waiting for authenticated session after
// bootstrap"). Web standards only, so it loads in the window and Vitest alike.

/** The part of denext `secureStore` the bearer uses. */
export interface DesktopSecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** The part of `Storage` the fallback uses (`sessionStorage`). */
export type DesktopSessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface DesktopBearerStoreOptions {
  /** The key, in the keychain and in session storage. */
  readonly key: string;
  readonly secure: DesktopSecretStore;
  /** `() => sessionStorage`; reading that property can throw, so it is read on use. */
  readonly session: () => DesktopSessionStore | undefined;
  /** Told when the keychain refuses (its error is `cause`). */
  readonly warn?: (message: string, cause: unknown) => void;
}

export interface DesktopBearerStore {
  /** The bearer, or `""` when there is none (what `getLocalEnvironmentBearerToken` answers). */
  read(): Promise<string>;
  /** Keep `token`; `false` when neither the keychain nor session storage takes it. */
  write(token: string): Promise<boolean>;
}

export function desktopBearerStore(options: DesktopBearerStoreOptions): DesktopBearerStore {
  const { key, secure } = options;
  const warn = options.warn ?? (() => undefined);
  const session = (): DesktopSessionStore | undefined => {
    try {
      return options.session();
    } catch {
      return undefined;
    }
  };

  return {
    async read() {
      try {
        const kept = session()?.getItem(key);
        if (kept) return kept;
      } catch {
        // No session storage: the keychain is the only place.
      }
      try {
        return (await secure.get(key)) ?? "";
      } catch (cause) {
        warn("T3 Code: the keychain is unavailable, so there is no saved local sign-in.", cause);
        return "";
      }
    },
    async write(token) {
      try {
        await secure.set(key, token);
      } catch (cause) {
        warn(
          "T3 Code: the keychain is unavailable; the local sign-in lasts until the app quits.",
          cause,
        );
        try {
          const store = session();
          if (store === undefined) return false;
          store.setItem(key, token);
          return true;
        } catch {
          return false;
        }
      }
      try {
        session()?.removeItem(key);
      } catch {
        // Nothing was kept there.
      }
      return true;
    },
  };
}
