import { describe, expect, it, vi } from "vite-plus/test";

import {
  type DesktopSecretStore,
  type DesktopSessionStore,
  desktopBearerStore,
} from "./desktopBearerStore";

const KEY = "t3.local-environment-bearer";

function memorySession(): DesktopSessionStore & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

function memoryKeychain(): DesktopSecretStore & { readonly items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    get: async (key) => items.get(key) ?? null,
    set: async (key, value) => void items.set(key, value),
  };
}

const unavailable = Object.assign(new Error("no Secret Service"), { code: "backend_unavailable" });
const refusingKeychain: DesktopSecretStore = {
  get: () => Promise.reject(unavailable),
  set: () => Promise.reject(unavailable),
};

describe("desktopBearerStore", () => {
  it("keeps the bearer in the keychain when it works", async () => {
    const keychain = memoryKeychain();
    const session = memorySession();
    const store = desktopBearerStore({ key: KEY, secure: keychain, session: () => session });
    expect(await store.read()).toBe("");
    expect(await store.write("bearer-1")).toBe(true);
    expect(keychain.items.get(KEY)).toBe("bearer-1");
    expect(session.items.has(KEY)).toBe(false);
    expect(await store.read()).toBe("bearer-1");
  });

  it("falls back to session storage when the keychain refuses, and says why", async () => {
    const session = memorySession();
    const warn = vi.fn();
    const store = desktopBearerStore({
      key: KEY,
      secure: refusingKeychain,
      session: () => session,
      warn,
    });
    expect(await store.read()).toBe("");
    expect(await store.write("bearer-1")).toBe(true);
    expect(session.items.get(KEY)).toBe("bearer-1");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("keychain"), unavailable);
    // After the reload pairing does, a fresh store over the same session storage has it.
    const reloaded = desktopBearerStore({
      key: KEY,
      secure: refusingKeychain,
      session: () => session,
    });
    expect(await reloaded.read()).toBe("bearer-1");
  });

  it("drops the session copy once the keychain takes a bearer", async () => {
    const keychain = memoryKeychain();
    const session = memorySession();
    session.setItem(KEY, "old");
    const store = desktopBearerStore({ key: KEY, secure: keychain, session: () => session });
    expect(await store.write("bearer-2")).toBe(true);
    expect(session.items.has(KEY)).toBe(false);
    expect(await store.read()).toBe("bearer-2");
  });

  it("reports failure when nothing can keep the bearer", async () => {
    const throwing = desktopBearerStore({
      key: KEY,
      secure: refusingKeychain,
      session: () => {
        throw new Error("SecurityError");
      },
    });
    expect(await throwing.write("bearer-1")).toBe(false);
    expect(await throwing.read()).toBe("");

    const absent = desktopBearerStore({
      key: KEY,
      secure: refusingKeychain,
      session: () => undefined,
    });
    expect(await absent.write("bearer-1")).toBe(false);

    const quota = desktopBearerStore({
      key: KEY,
      secure: refusingKeychain,
      session: () => ({
        ...memorySession(),
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      }),
    });
    expect(await quota.write("bearer-1")).toBe(false);
  });
});
