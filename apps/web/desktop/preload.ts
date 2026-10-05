// `desktop.preload` for the Deno Desktop build (denext.config.ts). denext bundles this into one
// classic script and runs it in the window before the page's own scripts, as Electron runs
// apps/desktop/src/preload.ts. It gives the web UI what the Electron preload gives it:
//
// - `window.desktopBridge` (the `DesktopBridge` contract), so the UI takes its desktop paths
//   (`isElectron`, the desktop-managed primary environment, bearer auth) unchanged;
// - Clerk's `__clerk_internal_electron(_passkeys)` globals (`exposeClerkBridge({ passkeys: true })`
//   there, `installClerkDesktopBridge` here), so the Electron Clerk shell runs as is;
// - the deep links Electron's main process handles (provider-auth returns), plus thread links.
//
// Every capability comes from denext (`denext/desktop/*`, `denext/mobile`); this file only maps the
// contract onto it. What the denext build cannot do yet (SSH and WSL environments, the in-app
// preview, the Electron updater, the Codex sign-in handoff) is absent or answers "unavailable",
// the way an older desktop shell would.

import type {
  ContextMenuItem as T3ContextMenuItem,
  DesktopBridge,
  DesktopEnvironmentBootstrap,
  DesktopServerExposureState,
  DesktopUpdateState,
  DesktopWslState,
} from "@t3tools/contracts";
import { providerAuthReturnUrl } from "@t3tools/shared/providerAuthReturnUrl";
import { setBadge } from "denext/desktop/app";
import { installClerkDesktopBridge } from "denext/desktop/clerk";
import { desktopOs, desktopWebSocketUrl, desktopWsUrl } from "denext/desktop/client";
import {
  focusWindow,
  getWindowState,
  makeWindowDraggable,
  onWindowStateChange,
  setWindowButtonPosition,
} from "denext/desktop/window";
import {
  type ContextMenuItem,
  onDeepLink,
  openExternal,
  pickFolder,
  secureStore,
  showContextMenu,
} from "denext/mobile";

import pkg from "../package.json" with { type: "json" };
import { deepLinkHref } from "../src/deepLinks.ts";

const PRIMARY_LOCAL_ENVIRONMENT_ID = "primary";
/** The keychain entries (the keychain service is the app identifier). */
const BEARER_KEY = "t3.local-environment-bearer";
const CONNECTION_CATALOG_KEY = "t3.connection-catalog";
/** The browser build's client-settings key (apps/web/src/clientPersistenceStorage.ts). */
const CLIENT_SETTINGS_KEY = "t3code:client-settings:v1";

// Clerk: the token cache in the keychain, OAuth through the system browser with the
// `t3code://app/` callback, and native passkeys (`@clerk/electron/passkeys` reads them).
installClerkDesktopBridge({ passkeys: true });

const platform = (() => {
  const os = desktopOs();
  return os === "windows" ? "win32" : os === "darwin" || os === "linux" ? os : "linux";
})();

// --- The local (primary) environment: served through the app origin ---------------------------

function primaryBootstrap(): DesktopEnvironmentBootstrap {
  // WebSockets go through the runtime's loopback relay, whose URL (with its per-launch token)
  // denext injects before this preload runs. The socket path is part of the base: the client
  // appends `/ws` only to a root base, and the relay's base is `/.deno-desktop-relay/<token>`.
  const hasRelay = desktopWsUrl() !== undefined;
  return {
    id: PRIMARY_LOCAL_ENVIRONMENT_ID,
    label: "Local",
    runningDistro: null,
    // HTTP rides the app origin: `spa.proxy` forwards /api, /oauth, /.well-known to the server.
    httpBaseUrl: `${location.origin}/`,
    // The relay reaches the same proxy (/ws).
    wsBaseUrl: hasRelay ? desktopWebSocketUrl("/ws") : null,
  };
}

/**
 * Pairing: Electron mints the bearer from the bootstrap token it started its own server with.
 * This build talks to a server it did not start, so the pairing credential the user enters in the
 * UI's pairing screen is exchanged for the bearer (the token exchange remote environments use),
 * kept in the keychain, and the page reloads onto it. Only the primary's browser-session request
 * is taken over; a failed exchange lets it through, so the screen reports the error as before.
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
const browserSessionUrl = `${location.origin}/api/auth/browser-session`;

async function exchangePairingCredential(credential: string): Promise<boolean> {
  const response = await nativeFetch(`${location.origin}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: credential,
      subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      client_label: "T3 Code Desktop",
      client_device_type: "desktop",
    }),
  });
  if (!response.ok) return false;
  const token = ((await response.json()) as { access_token?: unknown }).access_token;
  if (typeof token !== "string" || token.length === 0) return false;
  await secureStore.set(BEARER_KEY, token);
  return true;
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  if (requestUrl(input) !== browserSessionUrl) return nativeFetch(input, init);
  const request = new Request(input, init);
  if (request.method === "POST") {
    const body = (await request
      .clone()
      .json()
      .catch(() => null)) as {
      credential?: unknown;
    } | null;
    if (typeof body?.credential === "string") {
      if (await exchangePairingCredential(body.credential.trim()).catch(() => false)) {
        location.reload();
        // The page is going away; never settle, so the pairing screen shows no error meanwhile.
        return new Promise<Response>(() => {});
      }
    }
  }
  return nativeFetch(request);
};

// --- Window chrome (Electron's hiddenInset title bar) ------------------------------------------

let fullscreen = false;
const fullscreenListeners = new Set<(fullscreen: boolean) => void>();
void getWindowState().then(
  (state) => (fullscreen = state.fullscreen),
  () => undefined,
);
onWindowStateChange((state) => {
  if (state.fullscreen === fullscreen) return;
  fullscreen = state.fullscreen;
  for (const listener of fullscreenListeners) listener(fullscreen);
});

if (platform === "darwin") {
  // apps/desktop: traffic lights at x 16, centred on the 52 px workspace top bar, and their
  // reserved width in CSS.
  void setWindowButtonPosition({ x: 16, y: 52 / 2 - 7 }).catch(() => undefined);
  document.documentElement.style.setProperty("--desktop-window-controls-inset", "90px");
}

// The UI marks its title bars `.drag-region` (`-webkit-app-region: drag`); the system webviews
// ignore that CSS, so each one is made to move the window.
const draggable = new WeakSet<Element>();
function adoptDragRegions(root: ParentNode): void {
  for (const element of root.querySelectorAll(".drag-region")) {
    if (draggable.has(element)) continue;
    draggable.add(element);
    makeWindowDraggable(element as HTMLElement);
  }
}
new MutationObserver(() => adoptDragRegions(document)).observe(document, {
  childList: true,
  subtree: true,
});

// --- Deep links -----------------------------------------------------------------------------

// What Electron's main process does with `open-url` (apps/desktop DesktopClerk.ts), plus the thread
// links the mobile shells follow (../src/deepLinks.ts). Clerk's OAuth callback never gets here:
// `installClerkDesktopBridge` consumes it.
onDeepLink(
  ({ url, path }) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.host === "auth" && parsed.pathname === "/codex") {
      // Needs a loopback listener on the provider's fixed redirect port, which denext does not
      // offer: the web UI's paste-the-redirect-URL path still works.
      console.warn("T3 Code: the ChatGPT sign-in handoff is not available in this build.");
      return;
    }
    const destination = providerAuthReturnUrl(url);
    if (destination?.startsWith(`${location.origin}/`)) {
      location.assign(destination);
      void focusWindow().catch(() => undefined);
      return;
    }
    const href = deepLinkHref(path ?? `/${parsed.host}${parsed.pathname}`);
    if (href !== null) {
      // The UI routes with hash history when `desktopBridge` is present (src/main.tsx).
      location.hash = href;
      void focusWindow().catch(() => undefined);
    }
  },
  { accept: { schemes: ["t3code"] }, route: false },
);

// --- The bridge -------------------------------------------------------------------------------

function unavailable(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is not available in the T3 Code denext build.`));
}

const noUnsubscribe = () => () => undefined;

const exposureState: DesktopServerExposureState = {
  mode: "local-only",
  endpointUrl: null,
  advertisedHost: null,
  tailscaleServeEnabled: false,
  tailscaleServePort: 443,
};

const wslState: DesktopWslState = {
  enabled: false,
  distro: null,
  available: false,
  wslOnly: false,
  distros: [],
  preflightError: null,
};

const updateState: DesktopUpdateState = {
  enabled: false,
  status: "disabled",
  channel: "latest",
  currentVersion: pkg.version,
  hostArch: "other",
  appArch: "other",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

/** T3's menu items as denext's: native menus show no headers or icons (as in Electron). */
function menuItems(items: readonly T3ContextMenuItem[]): ContextMenuItem[] {
  return items
    .filter((item) => item.header !== true)
    .map((item) => ({
      id: item.id,
      label: item.checked ? `✓ ${item.label}` : item.label,
      ...(item.disabled ? { disabled: true } : {}),
      ...(item.destructive ? { destructive: true } : {}),
      ...(item.children ? { children: menuItems(item.children) } : {}),
    }));
}

function readClientSettings() {
  try {
    const raw = localStorage.getItem(CLIENT_SETTINGS_KEY);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

window.desktopBridge = {
  getAppBranding: () => null,
  getClientPlatform: () => platform,
  getSystemLocale: () => navigator.language || null,
  setNotificationBadge: async ({ count }) => {
    await setBadge(count > 0 ? count : null).catch(() => undefined);
  },
  onNotificationBadgeClear: noUnsubscribe,
  getLocalEnvironmentBootstraps: () => [primaryBootstrap()],
  getLocalEnvironmentEnabled: () => true,
  getLocalEnvironmentBearerToken: async () => (await secureStore.get(BEARER_KEY)) ?? "",
  getClientSettings: async () => readClientSettings(),
  setClientSettings: async (settings) => {
    localStorage.setItem(CLIENT_SETTINGS_KEY, JSON.stringify(settings));
  },
  getConnectionCatalog: () => secureStore.get(CONNECTION_CATALOG_KEY),
  setConnectionCatalog: async (catalog) => {
    await secureStore.set(CONNECTION_CATALOG_KEY, catalog);
    return true;
  },
  clearConnectionCatalog: () => secureStore.delete(CONNECTION_CATALOG_KEY),
  discoverSshHosts: async () => [],
  resolveSshHost: () => unavailable("SSH environments"),
  ensureSshEnvironment: () => unavailable("SSH environments"),
  disconnectSshEnvironment: async () => undefined,
  fetchSshEnvironmentDescriptor: () => unavailable("SSH environments"),
  bootstrapSshBearerSession: () => unavailable("SSH environments"),
  fetchSshSessionState: () => unavailable("SSH environments"),
  issueSshWebSocketTicket: () => unavailable("SSH environments"),
  onSshPasswordPrompt: noUnsubscribe,
  resolveSshPasswordPrompt: async () => undefined,
  getServerExposureState: async () => exposureState,
  setServerExposureMode: () => unavailable("Network access settings"),
  setTailscaleServeEnabled: () => unavailable("Tailscale Serve"),
  getAdvertisedEndpoints: async () => [],
  getWslState: async () => wslState,
  setWslBackendEnabled: async () => wslState,
  setWslDistro: async () => wslState,
  setWslOnly: async () => wslState,
  pickFolder: async () => (await pickFolder())?.path ?? null,
  setTheme: async () => undefined,
  showContextMenu: async (items, position) => {
    const id = await showContextMenu(menuItems(items), position ?? {});
    return id as (typeof items)[number]["id"] | null;
  },
  openExternal: async (url) => {
    try {
      await openExternal(url);
      return true;
    } catch {
      return false;
    }
  },
  onMenuAction: noUnsubscribe,
  getWindowFullscreenState: () => fullscreen,
  onWindowFullscreenStateChange: (listener) => {
    fullscreenListeners.add(listener);
    return () => fullscreenListeners.delete(listener);
  },
  getUpdateState: async () => updateState,
  setUpdateChannel: async () => updateState,
  checkForUpdate: async () => ({ checked: false, state: updateState }),
  downloadUpdate: async () => ({ accepted: false, completed: false, state: updateState }),
  installUpdate: async () => ({ accepted: false, completed: false, state: updateState }),
  onUpdateState: noUnsubscribe,
} satisfies DesktopBridge;

export {};
