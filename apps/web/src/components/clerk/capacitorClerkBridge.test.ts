import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  openAuthSession: vi.fn(),
}));

vi.mock("denext/mobile", () => ({ openAuthSession: mocks.openAuthSession }));

import {
  CLERK_OAUTH_REDIRECT_URL,
  createCapacitorClerkBridge,
  installCapacitorClerkBridge,
} from "./capacitorClerkBridge";

/** The native shell's globals, with the T3Native plugin when given. */
function stubShell(t3Native?: Record<string, unknown>) {
  vi.stubGlobal("window", {
    localStorage: memoryStorage(),
    Capacitor: { isNativePlatform: () => true, Plugins: t3Native ? { T3Native: t3Native } : {} },
  });
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe("capacitorClerkBridge", () => {
  beforeEach(() => {
    stubShell();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it("keeps Clerk's client token in the Keychain through T3Native", async () => {
    const keychain = new Map<string, string>();
    stubShell({
      keychainGet: vi.fn(async ({ key }: { key: string }) => ({
        value: keychain.get(key) ?? null,
      })),
      keychainSet: vi.fn(async ({ key, value }: { key: string; value: string }) => {
        keychain.set(key, value);
      }),
      keychainRemove: vi.fn(async ({ key }: { key: string }) => {
        keychain.delete(key);
      }),
    });
    const { tokenCache } = createCapacitorClerkBridge();

    expect(await tokenCache.getToken("__clerk_client_jwt")).toBeNull();
    await tokenCache.saveToken("__clerk_client_jwt", "client-jwt");
    expect(keychain.get("t3code.clerk.__clerk_client_jwt")).toBe("client-jwt");
    expect(await tokenCache.getToken("__clerk_client_jwt")).toBe("client-jwt");
    await tokenCache.clearToken("__clerk_client_jwt");
    expect(keychain.size).toBe(0);
    expect(window.localStorage.getItem("t3code.clerk.__clerk_client_jwt")).toBeNull();
  });

  it("falls back to localStorage in a shell without the Keychain plugin", async () => {
    const { tokenCache } = createCapacitorClerkBridge();

    await tokenCache.saveToken("__clerk_client_jwt", "client-jwt");

    expect(window.localStorage.getItem("t3code.clerk.__clerk_client_jwt")).toBe("client-jwt");
    expect(await tokenCache.getToken("__clerk_client_jwt")).toBe("client-jwt");
  });

  it("redirects OAuth to the desktop app's allowlisted t3code callback", () => {
    expect(createCapacitorClerkBridge().oauthTransport.getRedirectUrl()).toBe("t3code://app/");
    expect(CLERK_OAUTH_REDIRECT_URL).toBe("t3code://app/");
  });

  it("opens the provider in the system sign-in sheet and hands back the callback", async () => {
    const callbackUrl = "t3code://app/?rotating_token_nonce=nonce";
    mocks.openAuthSession.mockResolvedValue({ url: callbackUrl });
    const { oauthTransport } = createCapacitorClerkBridge();

    const result = await oauthTransport.open("https://accounts.google.com/o/oauth2/auth?x=1");

    expect(mocks.openAuthSession).toHaveBeenCalledExactlyOnceWith(
      "https://accounts.google.com/o/oauth2/auth?x=1",
      { callbackScheme: "t3code" },
    );
    expect(result).toEqual({ callbackUrl });
  });

  it("rejects when the user closes the sheet, so Clerk shows the cancellation", async () => {
    mocks.openAuthSession.mockRejectedValue(
      Object.assign(new Error("openAuthSession: cancelled"), { code: "cancelled" }),
    );

    await expect(
      createCapacitorClerkBridge().oauthTransport.open("https://accounts.google.com/"),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

  it("installs the bridge once and never replaces an Electron preload's", () => {
    installCapacitorClerkBridge();
    const installed = (window as { __clerk_internal_electron?: unknown }).__clerk_internal_electron;
    expect(installed).toMatchObject({
      tokenCache: expect.any(Object),
      oauthTransport: expect.any(Object),
    });

    installCapacitorClerkBridge();
    expect((window as { __clerk_internal_electron?: unknown }).__clerk_internal_electron).toBe(
      installed,
    );
  });
});
