import { ManagedRelay } from "@t3tools/client-runtime/relay";
import type { RelayDeviceRegistrationRequest } from "@t3tools/contracts/relay";
import { deviceInfo, registerForPush, requestPushPermission } from "denext/mobile";
import * as Effect from "effect/Effect";

import { runtime } from "../lib/runtime";
import { randomUUID } from "../lib/utils";
import { isNativeShell, nativeSecretStore } from "../nativeShell";
import { resolveCloudPublicConfig } from "./publicConfig";

/**
 * Agent notifications for the Capacitor shell: after a T3 Connect sign-in it registers the
 * device with the relay the way the React Native app does
 * (apps/mobile/src/features/agent-awareness/remoteRegistration.ts): the APNs token from
 * `registerForPush` (`denext/mobile`), `POST /v1/mobile/devices` through the shared
 * `ManagedRelayClient` (a DPoP token exchanged for the `mobile:registration` scope, which the
 * relay grants the `t3-mobile` client only; see ./managedRelayLayer.ts). Sign-out unregisters
 * it. Browsers and Electron never get past the `isNativeShell()` gate.
 *
 * Unlike the React Native app it registers once per launch and account instead of remembering
 * the last payload: the relay upserts, and the token can change between launches.
 * iOS only: an Android registration needs FCM (google-services.json) and the API level.
 */

/** The shell's bundle id, the APNs topic (apps/capacitor/capacitor.config.ts `appId`). */
const NATIVE_PUSH_BUNDLE_ID = "com.brainwires.t3code";

/** The React Native app's key for the same value (apps/mobile/src/persistence/mobile-storage.ts). */
export const NATIVE_PUSH_DEVICE_ID_KEY = "t3code.agent-awareness.device-id";

/** The relay's floor for `iosMajorVersion` (RelayDeviceRegistrationRequest). */
const MIN_IOS_MAJOR_VERSION = 18;

/**
 * Which APNs environment this build's tokens belong to. A Debug build is development-signed
 * (`aps-environment: development` in App.entitlements), so its tokens are sandbox tokens; an
 * archive exported for TestFlight / the App Store is re-signed with `production`. Capacitor
 * tells the page which it is: `window.Capacitor.DEBUG` is true only when Info.plist's
 * `CAPACITOR_DEBUG` is `true`, which apps/capacitor/ios/debug.xcconfig sets for the Debug
 * configuration alone.
 */
export function capacitorApsEnvironment(): "sandbox" | "production" {
  const capacitor = (window as { Capacitor?: { DEBUG?: unknown } }).Capacitor;
  return capacitor?.DEBUG === true ? "sandbox" : "production";
}

/** The major version of an OS version string (`"18.5"` → 18), or null. */
export function majorVersion(osVersion: string | undefined): number | null {
  const major = Number.parseInt(osVersion ?? "", 10);
  return Number.isInteger(major) ? major : null;
}

/** The registration body, with the React Native app's default preferences. */
export function makeNativeDeviceRegistrationRequest(input: {
  readonly deviceId: string;
  readonly label: string;
  readonly iosMajorVersion: number;
  readonly appVersion?: string;
  readonly pushToken?: string;
  readonly notificationsEnabled: boolean;
}): RelayDeviceRegistrationRequest {
  return {
    deviceId: input.deviceId,
    label: input.label,
    platform: "ios",
    iosMajorVersion: input.iosMajorVersion,
    ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    bundleId: NATIVE_PUSH_BUNDLE_ID,
    apsEnvironment: capacitorApsEnvironment(),
    ...(input.pushToken ? { pushToken: input.pushToken } : {}),
    preferences: {
      // The shell has no Live Activities (no widget extension, no push-to-start token).
      liveActivitiesEnabled: false,
      notificationsEnabled: input.notificationsEnabled,
      notifyOnApproval: true,
      notifyOnInput: true,
      notifyOnCompletion: true,
      notifyOnFailure: true,
    },
  };
}

async function loadOrCreateDeviceId(): Promise<string> {
  const store = nativeSecretStore();
  const existing = (await store.get(NATIVE_PUSH_DEVICE_ID_KEY))?.trim();
  if (existing) return existing;
  const deviceId = randomUUID();
  await store.set(NATIVE_PUSH_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

/** The registered account, and its token provider for the sign-out unregistration. */
let activeAccountId: string | null = null;
let activeTokenProvider: (() => Promise<string | null>) | null = null;
/** Bumped by every sign-in and sign-out, so a stale registration never reaches the relay. */
let generation = 0;

async function registerDevice(
  readClerkToken: () => Promise<string | null>,
  expectedGeneration: number,
): Promise<void> {
  const permission = await requestPushPermission();
  if (permission === "unsupported") return;
  const notificationsEnabled = permission === "granted";
  const pushToken = notificationsEnabled ? (await registerForPush()).token : undefined;
  const [deviceId, info] = await Promise.all([loadOrCreateDeviceId(), deviceInfo()]);
  const iosMajorVersion = majorVersion(info.osVersion);
  if (
    info.platform !== "ios" ||
    iosMajorVersion === null ||
    iosMajorVersion < MIN_IOS_MAJOR_VERSION
  ) {
    return;
  }
  const clerkToken = await readClerkToken();
  if (!clerkToken || expectedGeneration !== generation) return;
  const appVersion = import.meta.env.APP_VERSION as string | undefined;
  const payload = makeNativeDeviceRegistrationRequest({
    deviceId,
    label: info.model?.trim() || "iOS device",
    iosMajorVersion,
    ...(appVersion ? { appVersion } : {}),
    ...(pushToken ? { pushToken } : {}),
    notificationsEnabled,
  });
  await runtime.runPromise(
    ManagedRelay.ManagedRelayClient.pipe(
      Effect.flatMap((client) => client.registerDevice({ clerkToken, payload })),
    ),
  );
}

/**
 * Asks for notification permission, registers for APNs and registers the device with the relay
 * for the signed-in account, once per account and page. Callers need not wait: it never
 * rejects, and a failure is logged.
 */
export async function registerNativePushDevice(
  accountId: string,
  readClerkToken: () => Promise<string | null>,
): Promise<void> {
  if (!isNativeShell() || !resolveCloudPublicConfig().relayUrl) return;
  const sameAccount = accountId === activeAccountId;
  activeAccountId = accountId;
  activeTokenProvider = readClerkToken;
  if (sameAccount) return;
  const expectedGeneration = ++generation;
  try {
    await registerDevice(readClerkToken, expectedGeneration);
  } catch (error) {
    console.warn("[native-push] device registration failed", error);
  }
}

/**
 * Removes the device from the relay on sign-out or an account switch, with the previous
 * account's token provider, as the React Native app does. Best effort: once Clerk has signed
 * the account out its token provider answers null and nothing is sent. Never rejects.
 */
export async function unregisterNativePushDevice(): Promise<void> {
  const readClerkToken = activeTokenProvider;
  activeAccountId = null;
  activeTokenProvider = null;
  generation++;
  if (!readClerkToken || !isNativeShell()) return;
  try {
    const deviceId = await nativeSecretStore().get(NATIVE_PUSH_DEVICE_ID_KEY);
    if (!deviceId) return;
    const clerkToken = await readClerkToken();
    if (!clerkToken) return;
    await runtime.runPromise(
      ManagedRelay.ManagedRelayClient.pipe(
        Effect.flatMap((client) => client.unregisterDevice({ clerkToken, deviceId })),
      ),
    );
  } catch (error) {
    console.warn("[native-push] device unregistration failed", error);
  }
}
