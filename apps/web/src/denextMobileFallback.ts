/**
 * `denext/mobile` for the Node toolchain. The denext export (the build the Capacitor shell
 * bundles) resolves `denext/mobile` to the real module through deno.json's import map, but tsc,
 * the Vite build (browser, Electron), vitest and knip resolve through node_modules, where denext
 * has no package. tsconfig.json maps the specifier here for them. Those builds never run inside
 * the native shell, so this is exactly what denext itself does there: nothing. Keep the
 * signatures in step with denext's `src/mobile/ota.ts`, `src/mobile/resume.ts`,
 * `src/mobile/deep-link.ts`, `src/mobile/push.ts`, `src/mobile/auth-session.ts`,
 * `src/mobile/device.ts` and `src/mobile/bridge.ts`.
 */

type OtaPrepareResult =
  | { readonly kind: "unsupported" }
  | { readonly kind: "current" }
  | {
      readonly kind: "ready";
      readonly version: string;
      readonly required: boolean;
      readonly notes: string | null;
    }
  | { readonly kind: "skipped"; readonly reason: "rejected" | "busy" }
  | { readonly kind: "error"; readonly reason: string };

type OtaApplyResult =
  | { readonly kind: "unsupported" }
  | { readonly kind: "error"; readonly reason: string };

export function prepareUiUpdate(_options: {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): Promise<OtaPrepareResult> {
  return Promise.resolve({ kind: "unsupported" });
}

export function applyUiUpdate(_version: string): Promise<OtaApplyResult> {
  return Promise.resolve({ kind: "unsupported" });
}

export function otaBooted(): Promise<void> {
  return Promise.resolve();
}

export function onAppResume(_cb: (awayMs: number) => void): () => void {
  return () => {};
}

interface DeepLinkEvent {
  readonly url: string;
  readonly path?: string;
  readonly launch: boolean;
}

interface DeepLinkOptions {
  readonly accept?:
    | ((url: URL) => boolean)
    | { readonly schemes?: readonly string[]; readonly hosts?: readonly string[] };
  readonly route?: boolean | ((path: string, url: URL) => void);
}

export function useDeepLink(
  _callback: (event: DeepLinkEvent) => void,
  _options?: DeepLinkOptions,
): void {}

type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

interface PushRegistration {
  readonly platform: "ios" | "android";
  readonly token: string;
}

interface PushNotification {
  readonly id?: string;
  readonly title?: string;
  readonly body?: string;
  readonly data: Readonly<Record<string, unknown>>;
}

interface PushTap {
  readonly notification: PushNotification;
  readonly actionId: string;
  readonly inputValue?: string;
}

interface PushTapOptions {
  readonly accept?: DeepLinkOptions["accept"];
  readonly route?: DeepLinkOptions["route"];
}

export function requestPushPermission(): Promise<PushPermission> {
  return Promise.resolve("unsupported");
}

export function registerForPush(_options?: { timeoutMs?: number }): Promise<PushRegistration> {
  return Promise.reject(new Error("registerForPush: needs the iOS/Android shell."));
}

export function usePushTapped(_callback: (tap: PushTap) => void, _options?: PushTapOptions): void {}

type AuthSessionErrorCode = "cancelled" | "busy" | "invalid" | "unsupported" | "timeout";

export function openAuthSession(
  _url: string,
  _options: { callbackScheme: string; preferEphemeral?: boolean; timeoutMs?: number },
): Promise<{ readonly url: string }> {
  const error = new Error("openAuthSession: needs the iOS/Android shell.") as Error & {
    code: AuthSessionErrorCode;
  };
  error.code = "unsupported";
  return Promise.reject(error);
}

export function deviceInfo(): Promise<{
  readonly platform: "ios" | "android" | "web";
  readonly model?: string;
  readonly osVersion?: string;
  readonly isVirtual?: boolean;
}> {
  return Promise.resolve({ platform: "web" });
}

export function runtimePlatform(): "ios" | "android" | "desktop" | "web" {
  return "web";
}
