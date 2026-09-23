import type { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";
import { applyUiUpdate, onAppResume, otaBooted, prepareUiUpdate } from "denext/mobile";

import { readSavedConnectionCatalog } from "./connection/storage";
import { isNativeShell } from "./nativeShell";

/**
 * Over-the-air UI for the Capacitor shell (apps/capacitor/README.md, "OTA UI updates"). denext
 * does the work (`denext/mobile` plus the native `DenextOta` plugin); this module only says
 * where the UI comes from: the `/api/mobile/ui` routes of the paired T3 server, with its bearer
 * token, and holds the state of the update prompt (components/UiUpdateDialogHost.tsx). A new UI
 * is downloaded and verified first, so restarting into it is instant; it is never switched to
 * without the user's go-ahead. Browsers and desktop never get past the `isNativeShell()` gate.
 */

const MOBILE_UI_PATH = "/api/mobile/ui";

/** A return to the foreground after at least this long away checks for a newer UI too. */
export const OTA_RESUME_CHECK_AFTER_MS = 10_000;

export interface OtaEnvironment {
  /** The server's http(s) origin (plus any base path), without a trailing slash. */
  readonly baseUrl: string;
  readonly token: string;
}

/**
 * The paired environment to pull the UI from: the first saved, switched-on bearer connection
 * with an http(s) base URL and a token.
 */
export function pickOtaEnvironment(catalog: ConnectionCatalogDocument): OtaEnvironment | null {
  const disabled = new Set<string>(catalog.disabledEnvironmentIds);
  for (const profile of catalog.profiles) {
    if (profile._tag !== "BearerConnectionProfile" || disabled.has(profile.environmentId)) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(profile.httpBaseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    const credential = catalog.credentials.find(
      (entry) => entry.connectionId === profile.connectionId,
    )?.credential;
    if (credential?._tag !== "BearerConnectionCredential" || credential.token.length === 0) {
      continue;
    }
    return {
      baseUrl: `${url.origin}${url.pathname}`.replace(/\/+$/, ""),
      token: credential.token,
    };
  }
  return null;
}

/** A downloaded UI waiting for the user's go-ahead. */
export interface UiUpdatePrompt {
  readonly version: string;
  /** Stamped with `denext ota manifest --required`: the prompt cannot be dismissed. */
  readonly required: boolean;
  readonly notes: string | null;
  /** `applying` while the app restarts into the new UI; `failed` when that was refused. */
  readonly status: "waiting" | "applying" | "failed";
  readonly error: string | null;
}

let prompt: UiUpdatePrompt | null = null;
const promptListeners = new Set<() => void>();
/** Optional versions the user put off; asked again on the next launch. */
const dismissedVersions = new Set<string>();

function setPrompt(next: UiUpdatePrompt | null): void {
  prompt = next;
  for (const listener of promptListeners) listener();
}

export function readUiUpdatePrompt(): UiUpdatePrompt | null {
  return prompt;
}

export function subscribeUiUpdatePrompt(listener: () => void): () => void {
  promptListeners.add(listener);
  return () => promptListeners.delete(listener);
}

/** Restarts the app into the prompted UI. Settles only when that was refused. */
export async function applyPromptedUiUpdate(): Promise<void> {
  const target = prompt;
  if (target === null || target.status === "applying") return;
  setPrompt({ ...target, status: "applying", error: null });
  const result = await applyUiUpdate(target.version);
  setPrompt({
    ...target,
    status: "failed",
    error:
      result.kind === "unsupported"
        ? "This build of the app cannot install updates. Reinstall it to update."
        : result.reason,
  });
}

/** Puts an optional update off until the next launch. A required one cannot be dismissed. */
export function dismissUiUpdatePrompt(): void {
  if (prompt === null || prompt.required || prompt.status === "applying") return;
  dismissedVersions.add(prompt.version);
  setPrompt(null);
}

/**
 * Asks the paired server for a newer UI and, once denext has downloaded and verified it, shows
 * the update prompt. Best-effort and never throws. denext runs one check at a time.
 */
export async function requestUiUpdateCheck(): Promise<void> {
  if (!isNativeShell()) return;
  try {
    const environment = pickOtaEnvironment(await readSavedConnectionCatalog());
    if (environment === null) return;
    const result = await prepareUiUpdate({
      baseUrl: `${environment.baseUrl}${MOBILE_UI_PATH}`,
      headers: { authorization: `Bearer ${environment.token}` },
    });
    if (result.kind !== "ready") {
      // A 404 lands here too: the server has no mobile UI configured, which is the default.
      if (result.kind !== "current") console.info("[ota] UI update check:", result);
      return;
    }
    if (prompt?.version === result.version && prompt.required === result.required) return;
    if (!result.required && dismissedVersions.has(result.version)) return;
    if (prompt?.status === "applying") return;
    setPrompt({
      version: result.version,
      required: result.required,
      notes: result.notes,
      status: "waiting",
      error: null,
    });
  } catch (error) {
    console.warn("[ota] could not read the paired environment", error);
  }
}

let firstRenderSeen = false;

/**
 * Called once after the React app first renders: confirms the running UI to the shell (a UI
 * on its trial launch that never gets here is rolled back), runs the first update check, and
 * checks again whenever the app returns from {@link OTA_RESUME_CHECK_AFTER_MS} or more away.
 */
export function onUiFirstRender(): void {
  if (firstRenderSeen || !isNativeShell()) return;
  firstRenderSeen = true;
  void otaBooted().then(requestUiUpdateCheck);
  onAppResume((awayMs) => {
    if (awayMs >= OTA_RESUME_CHECK_AFTER_MS) void requestUiUpdateCheck();
  });
}
