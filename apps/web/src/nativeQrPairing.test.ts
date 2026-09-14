import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  canScanPairingQrCode,
  extractPairingUrlFromQrPayload,
  scanPairingQrCode,
} from "./nativeQrPairing";
import type { NativeT3Plugin } from "./nativeShell";

const PAIRING_URL = "http://192.168.1.20:3773/pair#token=pairing-credential";

function stubNativeShell(plugin: NativeT3Plugin | undefined) {
  vi.stubGlobal("window", {
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: plugin === undefined ? {} : { T3Native: plugin },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractPairingUrlFromQrPayload", () => {
  it("returns a `t3 pair` URL as scanned, trimmed", () => {
    expect(extractPairingUrlFromQrPayload(`  ${PAIRING_URL}\n`)).toBe(PAIRING_URL);
  });

  it("unwraps the pairing URL from a t3code:// deep link", () => {
    expect(
      extractPairingUrlFromQrPayload(`t3code://pair?pairingUrl=${encodeURIComponent(PAIRING_URL)}`),
    ).toBe(PAIRING_URL);
  });

  it("keeps a t3code:// link without a pairingUrl parameter for the form to validate", () => {
    expect(extractPairingUrlFromQrPayload("t3code://pair?other=1")).toBe("t3code://pair?other=1");
  });

  it("passes non-URL text through for the form to validate", () => {
    expect(extractPairingUrlFromQrPayload(" PAIRCODE ")).toBe("PAIRCODE");
  });

  it("rejects an empty payload", () => {
    expect(() => extractPairingUrlFromQrPayload("   ")).toThrow(
      "Scanned QR code did not contain a pairing URL.",
    );
  });
});

describe("scanPairingQrCode", () => {
  it("is unavailable outside the native shell and without the plugin", async () => {
    vi.stubGlobal("window", {});
    expect(canScanPairingQrCode()).toBe(false);
    expect((await scanPairingQrCode())._tag).toBe("Failed");

    stubNativeShell(undefined);
    expect(canScanPairingQrCode()).toBe(false);
  });

  it("unwraps a scanned deep link", async () => {
    stubNativeShell({
      scanQRCode: async () => ({
        value: `t3code://pair?pairingUrl=${encodeURIComponent(PAIRING_URL)}`,
      }),
    });

    expect(canScanPairingQrCode()).toBe(true);
    expect(await scanPairingQrCode()).toEqual({ _tag: "Scanned", pairingUrl: PAIRING_URL });
  });

  it("maps the plugin's cancelled and denied rejections", async () => {
    const reject = (code: string) => async () => {
      throw Object.assign(new Error(code), { code });
    };

    stubNativeShell({ scanQRCode: reject("cancelled") });
    expect(await scanPairingQrCode()).toEqual({ _tag: "Cancelled" });

    stubNativeShell({ scanQRCode: reject("denied") });
    expect(await scanPairingQrCode()).toEqual({ _tag: "Denied" });

    stubNativeShell({ scanQRCode: reject("unavailable") });
    expect(await scanPairingQrCode()).toEqual({ _tag: "Failed", message: "unavailable" });
  });
});
