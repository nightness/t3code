import type { ManagedRelay } from "@t3tools/client-runtime/relay";
import { RelayDeviceRegistrationRequest } from "@t3tools/contracts/relay";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  requestPushPermission: vi.fn(),
  registerForPush: vi.fn(),
  deviceInfo: vi.fn(),
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),
  relayUrl: "https://relay.t3.codes" as string | null,
}));

vi.mock("denext/mobile", () => ({
  requestPushPermission: mocks.requestPushPermission,
  registerForPush: mocks.registerForPush,
  deviceInfo: mocks.deviceInfo,
}));

vi.mock("./publicConfig", () => ({
  resolveCloudPublicConfig: () => ({ relayUrl: mocks.relayUrl }),
}));

vi.mock("../lib/runtime", async () => {
  const { ManagedRelay: Relay } = await import("@t3tools/client-runtime/relay");
  const { Effect: E } = await import("effect");
  const client = Relay.ManagedRelayClient.of({
    registerDevice: (input: unknown) =>
      E.promise(() => Promise.resolve(mocks.registerDevice(input))),
    unregisterDevice: (input: unknown) =>
      E.promise(() => Promise.resolve(mocks.unregisterDevice(input))),
  } as unknown as ManagedRelay.ManagedRelayClient["Service"]);
  return {
    runtime: {
      runPromise: <A, E>(effect: Effect.Effect<A, E, ManagedRelay.ManagedRelayClient>) =>
        E.runPromise(E.provideService(effect, Relay.ManagedRelayClient, client)),
    },
  };
});

import {
  NATIVE_PUSH_DEVICE_ID_KEY,
  capacitorApsEnvironment,
  majorVersion,
  makeNativeDeviceRegistrationRequest,
  registerNativePushDevice,
  unregisterNativePushDevice,
} from "./nativePushRegistration";

const decodeRegistration = Schema.decodeUnknownSync(RelayDeviceRegistrationRequest);

function stubShell(options: { readonly native?: boolean; readonly debug?: boolean } = {}) {
  const keychain = new Map<string, string>();
  vi.stubGlobal("window", {
    Capacitor: {
      DEBUG: options.debug ?? true,
      isNativePlatform: () => options.native ?? true,
      Plugins: {
        T3Native: {
          keychainGet: async ({ key }: { key: string }) => ({ value: keychain.get(key) ?? null }),
          keychainSet: async ({ key, value }: { key: string; value: string }) => {
            keychain.set(key, value);
          },
          keychainRemove: async ({ key }: { key: string }) => {
            keychain.delete(key);
          },
        },
      },
    },
  });
  return keychain;
}

const readToken = () => Promise.resolve("clerk-token");

describe("makeNativeDeviceRegistrationRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a body the relay accepts, with the React Native app's notification defaults", () => {
    stubShell({ debug: true });
    const body = makeNativeDeviceRegistrationRequest({
      deviceId: "device-1",
      label: "iPhone",
      iosMajorVersion: 26,
      appVersion: "0.0.42",
      pushToken: "abcdef0123",
      notificationsEnabled: true,
    });

    expect(decodeRegistration(body)).toEqual({
      deviceId: "device-1",
      label: "iPhone",
      platform: "ios",
      iosMajorVersion: 26,
      appVersion: "0.0.42",
      bundleId: "com.brainwires.t3code",
      apsEnvironment: "sandbox",
      pushToken: "abcdef0123",
      preferences: {
        liveActivitiesEnabled: false,
        notificationsEnabled: true,
        notifyOnApproval: true,
        notifyOnInput: true,
        notifyOnCompletion: true,
        notifyOnFailure: true,
      },
    });
  });

  it("registers a device without a token when notifications are off", () => {
    stubShell();
    const body = makeNativeDeviceRegistrationRequest({
      deviceId: "device-1",
      label: "iPhone",
      iosMajorVersion: 18,
      notificationsEnabled: false,
    });

    expect(decodeRegistration(body).pushToken).toBeUndefined();
    expect(body.preferences.notificationsEnabled).toBe(false);
  });
});

describe("capacitorApsEnvironment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is sandbox for a Debug build and production otherwise", () => {
    stubShell({ debug: true });
    expect(capacitorApsEnvironment()).toBe("sandbox");
    stubShell({ debug: false });
    expect(capacitorApsEnvironment()).toBe("production");
  });
});

describe("majorVersion", () => {
  it.each([
    ["26.0.1", 26],
    ["18", 18],
    [undefined, null],
    ["", null],
    ["beta", null],
  ])("reads %s as %s", (version, major) => {
    expect(majorVersion(version)).toBe(major);
  });
});

describe("native push registration", () => {
  beforeEach(() => {
    mocks.relayUrl = "https://relay.t3.codes";
    mocks.requestPushPermission.mockResolvedValue("granted");
    mocks.registerForPush.mockResolvedValue({ platform: "ios", token: "apns-hex-token" });
    mocks.deviceInfo.mockResolvedValue({ platform: "ios", model: "iPhone17,1", osVersion: "26.0" });
    mocks.registerDevice.mockReturnValue({ ok: true });
    mocks.unregisterDevice.mockReturnValue({ ok: true });
  });

  afterEach(async () => {
    await unregisterNativePushDevice();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("registers the APNs token with the relay after sign-in, keeping one device id", async () => {
    const keychain = stubShell({ debug: false });

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.registerDevice).toHaveBeenCalledOnce();
    const { clerkToken, payload } = mocks.registerDevice.mock.calls[0]![0];
    const deviceId = keychain.get(NATIVE_PUSH_DEVICE_ID_KEY);
    expect(clerkToken).toBe("clerk-token");
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload).toMatchObject({
      deviceId,
      label: "iPhone17,1",
      platform: "ios",
      iosMajorVersion: 26,
      bundleId: "com.brainwires.t3code",
      apsEnvironment: "production",
      pushToken: "apns-hex-token",
    });
    decodeRegistration(payload);

    // The next account reuses the device id.
    await unregisterNativePushDevice();
    await registerNativePushDevice("user-2", readToken);
    expect(mocks.registerDevice.mock.calls[1]![0].payload.deviceId).toBe(deviceId);
  });

  it("registers once per account while the page lives", async () => {
    stubShell();

    await Promise.all([
      registerNativePushDevice("user-1", readToken),
      registerNativePushDevice("user-1", readToken),
    ]);

    expect(mocks.registerDevice).toHaveBeenCalledOnce();
    expect(mocks.requestPushPermission).toHaveBeenCalledOnce();
  });

  it("registers without a token when the user declines notifications", async () => {
    stubShell();
    mocks.requestPushPermission.mockResolvedValue("denied");

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.registerForPush).not.toHaveBeenCalled();
    const { payload } = mocks.registerDevice.mock.calls[0]![0];
    expect(payload.pushToken).toBeUndefined();
    expect(payload.preferences.notificationsEnabled).toBe(false);
  });

  it.each([
    ["outside the native shell", { native: false }, {}],
    ["without a relay URL", {}, { relayUrl: null }],
  ])("does nothing %s", async (_label, shell, config) => {
    stubShell(shell);
    if ("relayUrl" in config) mocks.relayUrl = config.relayUrl;

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
  });

  it("skips a shell without the push plugin", async () => {
    stubShell();
    mocks.requestPushPermission.mockResolvedValue("unsupported");

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.deviceInfo).not.toHaveBeenCalled();
    expect(mocks.registerDevice).not.toHaveBeenCalled();
  });

  it.each([
    ["an iOS release the relay does not take", { platform: "ios", osVersion: "17.5" }],
    ["an unreadable OS version", { platform: "ios" }],
    ["Android", { platform: "android", osVersion: "15" }],
  ])("skips %s", async (_label, info) => {
    stubShell();
    mocks.deviceInfo.mockResolvedValue(info);

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.registerDevice).not.toHaveBeenCalled();
  });

  it("logs a failed registration instead of rejecting", async () => {
    stubShell();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.registerForPush.mockRejectedValue(new Error("registerForPush: no token within 15000 ms"));

    await registerNativePushDevice("user-1", readToken);

    expect(mocks.registerDevice).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not register an account that signed out while its token was read", async () => {
    stubShell();
    // The registration's read signs the account out first; the sign-out's read finds it gone.
    const readTokenThenSignOut = vi.fn(async (): Promise<string | null> => {
      if (readTokenThenSignOut.mock.calls.length > 1) return null;
      await unregisterNativePushDevice();
      return "clerk-token";
    });

    await registerNativePushDevice("user-1", readTokenThenSignOut);

    expect(mocks.registerDevice).not.toHaveBeenCalled();
    expect(mocks.unregisterDevice).not.toHaveBeenCalled();
  });

  it("unregisters the device on sign-out with the account's last token provider", async () => {
    const keychain = stubShell();
    await registerNativePushDevice("user-1", readToken);

    await unregisterNativePushDevice();

    expect(mocks.unregisterDevice).toHaveBeenCalledExactlyOnceWith({
      clerkToken: "clerk-token",
      deviceId: keychain.get(NATIVE_PUSH_DEVICE_ID_KEY),
    });
    // Nothing is left to unregister until the next sign-in.
    await unregisterNativePushDevice();
    expect(mocks.unregisterDevice).toHaveBeenCalledOnce();
  });

  it("skips the relay when the signed-out account has no token left", async () => {
    stubShell();
    await registerNativePushDevice("user-1", readToken);
    await registerNativePushDevice("user-1", () => Promise.resolve(null));

    await unregisterNativePushDevice();

    expect(mocks.unregisterDevice).not.toHaveBeenCalled();
  });
});
