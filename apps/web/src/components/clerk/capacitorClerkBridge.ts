import { openAuthSession } from "denext/mobile";

import { nativeSecretStore } from "../../nativeShell";

/**
 * Clerk inside the Capacitor shell (apps/capacitor) runs the same way it runs in the Electron
 * renderer: `@clerk/electron/react`'s provider, which bundles clerk-js in native mode (no
 * cookies: the client JWT travels in an `Authorization` header and is kept by a token cache) and
 * hands OAuth to a transport instead of redirecting the page. A WKWebView page at
 * `capacitor://localhost` cannot use Clerk's browser mode: the Frontend API's cookies are
 * third-party there, the providers refuse embedded webviews, and no redirect can come back to
 * the app's origin.
 *
 * That provider reads its token cache and OAuth transport from `window.__clerk_internal_electron`,
 * which Electron's preload script (`exposeClerkBridge`) fills over IPC. Here the page fills it
 * itself:
 *
 * - the token cache keeps the client JWT in the iOS Keychain through the T3Native plugin (the
 *   shell's connection catalog lives there too), else in `localStorage` (`nativeSecretStore`);
 * - the transport opens the provider in the system sign-in sheet (`openAuthSession` from
 *   `denext/mobile`: ASWebAuthenticationSession on iOS, a Custom Tab on Android) and resolves the
 *   callback URL. clerk-js then finishes the sign-in from its `rotating_token_nonce`, exactly as
 *   `@clerk/expo`'s `useSSO` does after `expo-web-browser`'s auth session.
 *
 * The redirect is the desktop app's production renderer URL (`t3code://app/`, see
 * apps/desktop/src/electron/ElectronProtocol.ts), so it is already on the Clerk instance's
 * native redirect allowlist. The sheet catches the `t3code:` callback itself; denext's deep-link
 * routing skips a callback an auth session is waiting for, and `deepLinkHref` maps no `/` path.
 */

const CLERK_OAUTH_CALLBACK_SCHEME = "t3code";
export const CLERK_OAUTH_REDIRECT_URL = `${CLERK_OAUTH_CALLBACK_SCHEME}://app/`;

/** Keychain / localStorage key prefix for the tokens clerk-js asks the cache to keep. */
const TOKEN_KEY_PREFIX = "t3code.clerk.";

export interface CapacitorClerkBridge {
  readonly tokenCache: {
    readonly getToken: (key: string) => Promise<string | null>;
    readonly saveToken: (key: string, value: string) => Promise<void>;
    readonly clearToken: (key: string) => Promise<void>;
  };
  readonly oauthTransport: {
    readonly getRedirectUrl: () => string;
    readonly open: (url: string) => Promise<{ readonly callbackUrl: string }>;
  };
}

export function createCapacitorClerkBridge(): CapacitorClerkBridge {
  const store = nativeSecretStore();
  return {
    tokenCache: {
      getToken: (key) => store.get(`${TOKEN_KEY_PREFIX}${key}`),
      saveToken: (key, value) => store.set(`${TOKEN_KEY_PREFIX}${key}`, value),
      clearToken: (key) => store.remove(`${TOKEN_KEY_PREFIX}${key}`),
    },
    oauthTransport: {
      getRedirectUrl: () => CLERK_OAUTH_REDIRECT_URL,
      open: async (url) => {
        const { url: callbackUrl } = await openAuthSession(url, {
          callbackScheme: CLERK_OAUTH_CALLBACK_SCHEME,
        });
        return { callbackUrl };
      },
    },
  };
}

/** Installs the bridge for `@clerk/electron/react`, unless a real Electron preload did. */
export function installCapacitorClerkBridge(): void {
  const target = window as { __clerk_internal_electron?: unknown };
  target.__clerk_internal_electron ??= createCapacitorClerkBridge();
}
