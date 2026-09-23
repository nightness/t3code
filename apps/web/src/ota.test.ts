import { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";
import * as Schema from "effect/Schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  prepareUiUpdate: vi.fn(),
  applyUiUpdate: vi.fn(),
  otaBooted: vi.fn(),
  onAppResume: vi.fn(),
  readSavedConnectionCatalog: vi.fn(),
  isNativeShell: vi.fn(),
}));

vi.mock("denext/mobile", () => ({
  prepareUiUpdate: mocks.prepareUiUpdate,
  applyUiUpdate: mocks.applyUiUpdate,
  otaBooted: mocks.otaBooted,
  onAppResume: mocks.onAppResume,
}));
vi.mock("./connection/storage", () => ({
  readSavedConnectionCatalog: mocks.readSavedConnectionCatalog,
}));
vi.mock("./nativeShell", () => ({ isNativeShell: mocks.isNativeShell }));

const decodeCatalog = Schema.decodeUnknownSync(ConnectionCatalogDocument);

function bearerConnection(options: {
  readonly id: string;
  readonly httpBaseUrl: string;
  readonly token?: string;
}) {
  return {
    profile: {
      _tag: "BearerConnectionProfile",
      connectionId: options.id,
      environmentId: `env-${options.id}`,
      label: options.id,
      httpBaseUrl: options.httpBaseUrl,
      wsBaseUrl: options.httpBaseUrl.replace(/^http/, "ws"),
    },
    credential:
      options.token === undefined
        ? []
        : [
            {
              connectionId: options.id,
              credential: { _tag: "BearerConnectionCredential", token: options.token },
            },
          ],
  };
}

function catalog(
  connections: ReadonlyArray<ReturnType<typeof bearerConnection>>,
  disabledEnvironmentIds: ReadonlyArray<string> = [],
) {
  return decodeCatalog({
    schemaVersion: 1,
    targets: [],
    profiles: connections.map((connection) => connection.profile),
    credentials: connections.flatMap((connection) => connection.credential),
    remoteDpopTokens: [],
    disabledEnvironmentIds,
  });
}

const PAIRED = catalog([
  bearerConnection({ id: "mac", httpBaseUrl: "http://192.168.1.20:3773/", token: "secret" }),
]);

/** A fresh copy of ./ota, so its once-per-page first-render latch starts unset. */
const loadOta = async () => {
  vi.resetModules();
  return await import("./ota");
};

beforeEach(() => {
  mocks.isNativeShell.mockReturnValue(true);
  mocks.readSavedConnectionCatalog.mockResolvedValue(PAIRED);
  mocks.prepareUiUpdate.mockResolvedValue({ kind: "current" });
  mocks.otaBooted.mockResolvedValue(undefined);
  mocks.onAppResume.mockReturnValue(() => {});
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe("requestUiUpdateCheck", () => {
  it("checks the paired server's mobile UI routes with its bearer token", async () => {
    const { requestUiUpdateCheck } = await loadOta();

    await requestUiUpdateCheck();

    expect(mocks.prepareUiUpdate).toHaveBeenCalledExactlyOnceWith({
      baseUrl: "http://192.168.1.20:3773/api/mobile/ui",
      headers: { authorization: "Bearer secret" },
    });
  });

  it("does nothing outside the native shell", async () => {
    mocks.isNativeShell.mockReturnValue(false);
    const { requestUiUpdateCheck } = await loadOta();

    await requestUiUpdateCheck();

    expect(mocks.readSavedConnectionCatalog).not.toHaveBeenCalled();
    expect(mocks.prepareUiUpdate).not.toHaveBeenCalled();
  });

  it("does nothing until an environment is paired", async () => {
    mocks.readSavedConnectionCatalog.mockResolvedValue(catalog([]));
    const { requestUiUpdateCheck } = await loadOta();

    await requestUiUpdateCheck();

    expect(mocks.prepareUiUpdate).not.toHaveBeenCalled();
  });

  it("swallows a catalog read failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.readSavedConnectionCatalog.mockRejectedValue(new Error("keychain locked"));
    const { requestUiUpdateCheck } = await loadOta();

    await expect(requestUiUpdateCheck()).resolves.toBeUndefined();
    expect(mocks.prepareUiUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});

describe("onUiFirstRender", () => {
  it("confirms the boot before the first check, once per page", async () => {
    const order: Array<string> = [];
    mocks.otaBooted.mockImplementation(async () => void order.push("booted"));
    mocks.prepareUiUpdate.mockImplementation(async () => {
      order.push("check");
      return { kind: "current" };
    });
    const { onUiFirstRender } = await loadOta();

    onUiFirstRender();
    onUiFirstRender();
    await vi.waitFor(() => expect(mocks.prepareUiUpdate).toHaveBeenCalled());

    expect(order).toEqual(["booted", "check"]);
    expect(mocks.otaBooted).toHaveBeenCalledOnce();
  });

  it("does nothing outside the native shell", async () => {
    mocks.isNativeShell.mockReturnValue(false);
    const { onUiFirstRender } = await loadOta();

    onUiFirstRender();
    await Promise.resolve();

    expect(mocks.otaBooted).not.toHaveBeenCalled();
    expect(mocks.prepareUiUpdate).not.toHaveBeenCalled();
    expect(mocks.onAppResume).not.toHaveBeenCalled();
  });

  it("checks again on a return from 10 s or more away, not on a quick glance", async () => {
    const { onUiFirstRender } = await loadOta();

    onUiFirstRender();
    await vi.waitFor(() => expect(mocks.prepareUiUpdate).toHaveBeenCalledOnce());
    expect(mocks.onAppResume).toHaveBeenCalledOnce();
    const onResume = mocks.onAppResume.mock.calls[0]![0] as (awayMs: number) => void;

    onResume(9_999);
    await Promise.resolve();
    expect(mocks.prepareUiUpdate).toHaveBeenCalledOnce();

    onResume(10_000);
    await vi.waitFor(() => expect(mocks.prepareUiUpdate).toHaveBeenCalledTimes(2));
  });
});

const READY = { kind: "ready", version: "a".repeat(64), required: false, notes: null } as const;

describe("the update prompt", () => {
  it("shows once denext has a verified UI ready", async () => {
    mocks.prepareUiUpdate.mockResolvedValue({ ...READY, notes: "Faster threads" });
    const ota = await loadOta();
    const listener = vi.fn();
    ota.subscribeUiUpdatePrompt(listener);

    await ota.requestUiUpdateCheck();

    expect(ota.readUiUpdatePrompt()).toEqual({
      version: READY.version,
      required: false,
      notes: "Faster threads",
      status: "waiting",
      error: null,
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("stays hidden when the UI is current or the check fails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const ota = await loadOta();

    await ota.requestUiUpdateCheck();
    mocks.prepareUiUpdate.mockResolvedValue({ kind: "error", reason: "HTTP 404" });
    await ota.requestUiUpdateCheck();

    expect(ota.readUiUpdatePrompt()).toBeNull();
    expect(info).toHaveBeenCalledOnce();
  });

  it("puts an optional update off until the next launch", async () => {
    mocks.prepareUiUpdate.mockResolvedValue(READY);
    const ota = await loadOta();

    await ota.requestUiUpdateCheck();
    ota.dismissUiUpdatePrompt();
    await ota.requestUiUpdateCheck();

    expect(ota.readUiUpdatePrompt()).toBeNull();
  });

  it("never lets a required update be dismissed, even one put off while optional", async () => {
    mocks.prepareUiUpdate.mockResolvedValue(READY);
    const ota = await loadOta();
    await ota.requestUiUpdateCheck();
    ota.dismissUiUpdatePrompt();

    mocks.prepareUiUpdate.mockResolvedValue({ ...READY, required: true });
    await ota.requestUiUpdateCheck();
    ota.dismissUiUpdatePrompt();

    expect(ota.readUiUpdatePrompt()).toMatchObject({ version: READY.version, required: true });
  });

  it("restarts into the prompted version and reports a refusal", async () => {
    mocks.prepareUiUpdate.mockResolvedValue(READY);
    mocks.applyUiUpdate.mockResolvedValue({ kind: "error", reason: "busy" });
    const ota = await loadOta();
    await ota.requestUiUpdateCheck();

    await ota.applyPromptedUiUpdate();

    expect(mocks.applyUiUpdate).toHaveBeenCalledExactlyOnceWith(READY.version);
    expect(ota.readUiUpdatePrompt()).toMatchObject({ status: "failed", error: "busy" });
  });

  it("shows a newer version in place of the one on screen", async () => {
    mocks.prepareUiUpdate.mockResolvedValue(READY);
    const ota = await loadOta();
    await ota.requestUiUpdateCheck();

    mocks.prepareUiUpdate.mockResolvedValue({ ...READY, version: "b".repeat(64) });
    await ota.requestUiUpdateCheck();

    expect(ota.readUiUpdatePrompt()?.version).toBe("b".repeat(64));
  });
});

describe("pickOtaEnvironment", () => {
  it("takes the first switched-on bearer connection with an http(s) URL and a token", async () => {
    const { pickOtaEnvironment } = await loadOta();
    const picked = pickOtaEnvironment(
      catalog(
        [
          bearerConnection({ id: "off", httpBaseUrl: "http://10.0.0.1:3773", token: "t-off" }),
          bearerConnection({ id: "no-token", httpBaseUrl: "http://10.0.0.2:3773" }),
          bearerConnection({ id: "bad-url", httpBaseUrl: "not a url", token: "t-bad" }),
          bearerConnection({ id: "ftp", httpBaseUrl: "ftp://10.0.0.3", token: "t-ftp" }),
          bearerConnection({ id: "tail", httpBaseUrl: "https://mac.tail.ts.net/", token: "t" }),
          bearerConnection({ id: "later", httpBaseUrl: "http://10.0.0.4:3773", token: "t2" }),
        ],
        ["env-off"],
      ),
    );

    expect(picked).toEqual({ baseUrl: "https://mac.tail.ts.net", token: "t" });
  });

  it("finds nothing in an empty catalog", async () => {
    const { pickOtaEnvironment } = await loadOta();
    expect(pickOtaEnvironment(catalog([]))).toBeNull();
  });
});
