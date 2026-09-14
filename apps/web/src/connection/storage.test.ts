import {
  ConnectionTransientError,
  PrimaryConnectionTarget,
} from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { afterEach, vi } from "vite-plus/test";

import type { NativeT3Plugin } from "../nativeShell";
import {
  makeBrowserGitHubRoutingPermissions,
  makeCatalogBackend,
  makeCatalogStore,
  NATIVE_CATALOG_KEYCHAIN_KEY,
} from "./storage";

const emptyCatalog = {
  schemaVersion: 1,
  targets: [],
  profiles: [],
  credentials: [],
  remoteDpopTokens: [],
  disabledEnvironmentIds: [],
} as const;
const decodeCatalog = Schema.decodeUnknownSync(Schema.fromJsonString(ConnectionCatalogDocument));
const encodeCatalog = Schema.encodeSync(Schema.fromJsonString(ConnectionCatalogDocument));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("makeCatalogStore", () => {
  it.effect("quarantines malformed catalogs and starts from an empty document", () =>
    Effect.gen(function* () {
      const writes: string[] = [];
      const quarantined: string[] = [];
      const store = yield* makeCatalogStore({
        read: Effect.succeed("{not-json"),
        write: (raw) => Effect.sync(() => writes.push(raw)),
        quarantine: (raw) => Effect.sync(() => quarantined.push(raw)),
      });

      expect(yield* store.read).toEqual(emptyCatalog);
      expect(quarantined).toEqual(["{not-json"]);
      expect(writes).toHaveLength(1);
      expect(decodeCatalog(writes[0]!)).toEqual(emptyCatalog);
    }),
  );

  it.effect("does not hide catalog read failures", () =>
    Effect.gen(function* () {
      const failure = new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "permission denied",
      });
      const store = yield* makeCatalogStore({
        read: Effect.fail(failure),
        write: () => Effect.void,
      });

      expect(yield* Effect.flip(store.read)).toBe(failure);
    }),
  );
});

describe("makeCatalogBackend", () => {
  it.effect("fails writes when desktop secure storage declines the catalog", () =>
    Effect.gen(function* () {
      const setConnectionCatalog = vi.fn().mockResolvedValue(false);
      vi.stubGlobal("window", {
        desktopBridge: {
          getConnectionCatalog: vi.fn().mockResolvedValue(null),
          setConnectionCatalog,
        },
      });
      const backend = makeCatalogBackend({} as IDBDatabase);

      const error = yield* backend.write("{}").pipe(Effect.flip);

      expect(error).toBeInstanceOf(ConnectionTransientError);
      expect(error.message).toContain("Desktop secure storage is unavailable");
      expect(setConnectionCatalog).toHaveBeenCalledWith("{}");
    }),
  );
});

/** Just enough of IDBDatabase for the catalog record: get / put / delete on one store. */
function makeFakeCatalogDatabase(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial));
  const database = {
    transaction: () => {
      const transaction = Object.assign(new EventTarget(), { error: null });
      const complete = () =>
        queueMicrotask(() => {
          transaction.dispatchEvent(new Event("complete"));
        });
      return Object.assign(transaction, {
        objectStore: () => ({
          get: (key: string) => {
            const request = Object.assign(new EventTarget(), {
              result: undefined as unknown,
              error: null,
            });
            queueMicrotask(() => {
              request.result = values.get(key);
              request.dispatchEvent(new Event("success"));
            });
            return request;
          },
          put: (value: unknown, key: string) => {
            values.set(key, value);
            complete();
          },
          delete: (key: string) => {
            values.delete(key);
            complete();
          },
        }),
      });
    },
  };
  return { database: database as unknown as IDBDatabase, values };
}

function makeFakeKeychain(
  options: { readonly failSet?: boolean; readonly corruptReadBack?: boolean } = {},
) {
  const items = new Map<string, string>();
  const plugin = {
    keychainGet: vi.fn(async ({ key }: { readonly key: string }) => {
      const value = items.get(key);
      return {
        value: value === undefined ? null : options.corruptReadBack ? `${value}~` : value,
      };
    }),
    keychainSet: vi.fn(async ({ key, value }: { readonly key: string; readonly value: string }) => {
      if (options.failSet) {
        throw Object.assign(new Error("Keychain write failed (OSStatus -34018)."), {
          code: "keychain",
        });
      }
      items.set(key, value);
      return {};
    }),
    keychainRemove: vi.fn(async ({ key }: { readonly key: string }) => {
      items.delete(key);
      return {};
    }),
  };
  return { plugin, items };
}

/** Replaces the default logger so a test can count the backend's warnings. */
function captureLogs() {
  const messages: unknown[] = [];
  const layer = Logger.layer([
    Logger.make((options) => {
      messages.push(options.message);
    }),
  ]);
  return { messages, layer };
}

function stubNativeShell(plugin: NativeT3Plugin | undefined) {
  vi.stubGlobal("window", {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: plugin === undefined ? {} : { T3Native: plugin },
    },
  });
}

describe("makeCatalogBackend in the native shell", () => {
  it.effect("reads and writes the catalog through the Keychain", () =>
    Effect.gen(function* () {
      const { plugin, items } = makeFakeKeychain();
      items.set(NATIVE_CATALOG_KEYCHAIN_KEY, "stored");
      stubNativeShell(plugin);
      const { database, values } = makeFakeCatalogDatabase({ document: "stale" });
      const backend = makeCatalogBackend(database);

      expect(yield* backend.read).toBe("stored");
      yield* backend.write("next");

      expect(plugin.keychainGet).toHaveBeenCalledWith({ key: NATIVE_CATALOG_KEYCHAIN_KEY });
      expect(plugin.keychainSet).toHaveBeenCalledWith({
        key: NATIVE_CATALOG_KEYCHAIN_KEY,
        value: "next",
      });
      expect(items.get(NATIVE_CATALOG_KEYCHAIN_KEY)).toBe("next");
      // Once the Keychain holds the catalog, IndexedDB is neither read nor touched.
      expect(values.get("document")).toBe("stale");
    }),
  );

  it.effect("treats an empty Keychain and an empty IndexedDB as no catalog yet", () =>
    Effect.gen(function* () {
      const { plugin, items } = makeFakeKeychain();
      stubNativeShell(plugin);
      const { database, values } = makeFakeCatalogDatabase();
      const backend = makeCatalogBackend(database);

      expect(yield* backend.read).toBeNull();
      yield* backend.write("first");

      expect(items.get(NATIVE_CATALOG_KEYCHAIN_KEY)).toBe("first");
      expect(values.size).toBe(0);
    }),
  );

  it.effect("fails reads the Keychain refuses instead of treating them as missing", () =>
    Effect.gen(function* () {
      const { plugin } = makeFakeKeychain();
      plugin.keychainGet.mockRejectedValueOnce(new Error("OSStatus -25308"));
      stubNativeShell(plugin);
      const { database, values } = makeFakeCatalogDatabase({ document: "legacy" });

      const error = yield* makeCatalogBackend(database).read.pipe(Effect.flip);

      expect(error).toBeInstanceOf(ConnectionTransientError);
      expect(values.get("document")).toBe("legacy");
      expect(plugin.keychainSet).not.toHaveBeenCalled();
    }),
  );

  it.effect(
    "moves an IndexedDB catalog into the Keychain, then deletes the IndexedDB record",
    () => {
      const logs = captureLogs();
      return Effect.gen(function* () {
        const { plugin, items } = makeFakeKeychain();
        stubNativeShell(plugin);
        const { database, values } = makeFakeCatalogDatabase({ document: "legacy" });
        const backend = makeCatalogBackend(database);

        expect(yield* backend.read).toBe("legacy");
        expect(items.get(NATIVE_CATALOG_KEYCHAIN_KEY)).toBe("legacy");
        expect(values.has("document")).toBe(false);

        yield* backend.write("next");
        expect(items.get(NATIVE_CATALOG_KEYCHAIN_KEY)).toBe("next");
        expect(values.has("document")).toBe(false);
        expect(logs.messages).toEqual([]);
      }).pipe(Effect.provide(logs.layer));
    },
  );

  it.effect("keeps the IndexedDB catalog for the session when the Keychain write fails", () => {
    const logs = captureLogs();
    return Effect.gen(function* () {
      const { plugin, items } = makeFakeKeychain({ failSet: true });
      stubNativeShell(plugin);
      const { database, values } = makeFakeCatalogDatabase({ document: "legacy" });
      const backend = makeCatalogBackend(database);

      expect(yield* backend.read).toBe("legacy");
      expect(values.get("document")).toBe("legacy");
      expect(items.size).toBe(0);

      yield* backend.write("next");
      expect(values.get("document")).toBe("next");
      expect(plugin.keychainSet).toHaveBeenCalledTimes(1);
      expect(logs.messages).toHaveLength(1);
    }).pipe(Effect.provide(logs.layer));
  });

  it.effect("removes a Keychain copy whose read-back does not match and keeps IndexedDB", () => {
    const logs = captureLogs();
    return Effect.gen(function* () {
      const { plugin, items } = makeFakeKeychain({ corruptReadBack: true });
      stubNativeShell(plugin);
      const { database, values } = makeFakeCatalogDatabase({ document: "legacy" });

      expect(yield* makeCatalogBackend(database).read).toBe("legacy");

      expect(plugin.keychainRemove).toHaveBeenCalledWith({ key: NATIVE_CATALOG_KEYCHAIN_KEY });
      expect(items.size).toBe(0);
      expect(values.get("document")).toBe("legacy");
      expect(logs.messages).toHaveLength(1);
    }).pipe(Effect.provide(logs.layer));
  });

  it.effect("stays on IndexedDB when the T3Native plugin or its Keychain methods are absent", () =>
    Effect.gen(function* () {
      for (const plugin of [undefined, { scanQRCode: async () => ({ value: "" }) }]) {
        stubNativeShell(plugin);
        const { database, values } = makeFakeCatalogDatabase({ document: "legacy" });
        const backend = makeCatalogBackend(database);

        expect(yield* backend.read).toBe("legacy");
        yield* backend.write("next");
        expect(values.get("document")).toBe("next");
      }
    }),
  );
});

describe("browser GitHub routing permissions", () => {
  it.effect("revokes across runtimes before storage events and resists stale catalog writes", () =>
    Effect.gen(function* () {
      const values = new Map<string, string>();
      const localStorage: Storage = {
        get length() {
          return values.size;
        },
        key: (index) => [...values.keys()][index] ?? null,
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => {
          values.set(key, value);
        },
        removeItem: (key) => {
          values.delete(key);
        },
        clear: () => {
          values.clear();
        },
      };
      const firstBrowser = Object.assign(new EventTarget(), { localStorage });
      const secondBrowser = Object.assign(new EventTarget(), { localStorage });
      const first = makeBrowserGitHubRoutingPermissions(firstBrowser);
      const second = makeBrowserGitHubRoutingPermissions(secondBrowser);
      const entry = {
        target: new PrimaryConnectionTarget({
          environmentId: EnvironmentId.make("first"),
          label: "First",
          httpBaseUrl: "http://localhost:3000",
          wsBaseUrl: "ws://localhost:3000",
        }),
        profile: Option.none(),
        enabled: true,
      };
      const other = {
        ...entry,
        target: new PrimaryConnectionTarget({
          ...entry.target,
          environmentId: EnvironmentId.make("second"),
        }),
      };
      expect(yield* first.get(entry)).toBe("off");
      yield* first.set(entry, "read-write");
      expect(yield* second.get(entry)).toBe("read-write");
      const oldPermissions = Option.getOrThrow(yield* Stream.runHead(first.changes));
      const staleCatalog = yield* makeCatalogStore({
        read: Effect.succeed(
          encodeCatalog({ ...emptyCatalog, githubRoutingPermissions: oldPermissions }),
        ),
        write: () => Effect.void,
      });
      yield* staleCatalog.read;
      const listening = yield* Deferred.make<void>();
      const revoked = yield* Deferred.make<void>();
      yield* second.changes.pipe(
        Stream.runForEach((permissions) =>
          Deferred.succeed(permissions.length > 0 ? listening : revoked, undefined),
        ),
        Effect.forkChild,
      );
      yield* Deferred.await(listening);

      yield* first.set(entry, "off");
      expect(yield* second.get(entry)).toBe("off");
      secondBrowser.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
      yield* Deferred.await(revoked);
      yield* second.set(other, "read");
      yield* staleCatalog.update((document) => ({ ...document, accountId: "updated" }));
      expect(yield* second.get(entry)).toBe("off");
      expect(yield* first.get(other)).toBe("read");
      expect(yield* makeBrowserGitHubRoutingPermissions(firstBrowser).get(entry)).toBe("off");

      yield* first.set(entry, "read-write");
      yield* second.forget(entry.target.environmentId);
      expect(yield* first.get(entry)).toBe("off");
      expect(yield* first.get(other)).toBe("read");
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("Storage unavailable");
      });
      expect(yield* first.set(entry, "read-write").pipe(Effect.flip)).toBeInstanceOf(
        ConnectionTransientError,
      );
      expect(yield* second.get(entry)).toBe("off");
    }).pipe(Effect.scoped),
  );
});
