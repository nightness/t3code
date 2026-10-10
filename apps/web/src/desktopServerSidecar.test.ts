import {
  DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS,
  currentDesktopBootstrapToken,
  isValidDesktopBootstrapToken,
} from "@t3tools/shared/desktopBootstrapToken";
import { describe, expect, it } from "vite-plus/test";

import {
  SERVER_SIDECAR_SECRET_NAMES,
  deriveDesktopBootstrapToken,
  readSidecarBootstrapToken,
  serverSidecarSecrets,
  sidecarBootstrapToken,
} from "./desktopServerSidecar";

describe("deriveDesktopBootstrapToken", () => {
  it("derives the token the server derives", async () => {
    const secret = "a".repeat(64);
    for (const nowMs of [
      0,
      1_700_000_000_000,
      1_700_000_000_000 + DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS,
    ]) {
      expect(await deriveDesktopBootstrapToken(secret, nowMs)).toBe(
        currentDesktopBootstrapToken(secret, nowMs),
      );
    }
  });
});

describe("serverSidecarSecrets", () => {
  it("makes a fresh secret and a token the server accepts", async () => {
    const nowMs = Date.UTC(2026, 9, 10, 9);
    const first = await serverSidecarSecrets(nowMs);
    const second = await serverSidecarSecrets(nowMs);
    const secret = first[SERVER_SIDECAR_SECRET_NAMES.secret]!;
    const token = first[SERVER_SIDECAR_SECRET_NAMES.token]!;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(second[SERVER_SIDECAR_SECRET_NAMES.secret]).not.toBe(secret);
    expect(isValidDesktopBootstrapToken(secret, token, nowMs)).toBe(true);
    // Still good in the next window, dead two windows on (the server's rule).
    expect(
      isValidDesktopBootstrapToken(secret, token, nowMs + DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS),
    ).toBe(true);
    expect(
      isValidDesktopBootstrapToken(secret, token, nowMs + 2 * DESKTOP_BOOTSTRAP_TOKEN_WINDOW_MS),
    ).toBe(false);
  });
});

describe("sidecarBootstrapToken", () => {
  it("reads the exposed token", () => {
    expect(sidecarBootstrapToken({ name: "server", values: { bootstrapToken: "t0k" } })).toBe(
      "t0k",
    );
  });

  it("is undefined when the answer has none", () => {
    for (const info of [
      undefined,
      null,
      "x",
      {},
      { values: null },
      { values: { bootstrapToken: "" } },
      { values: { bootstrapToken: 42 } },
    ]) {
      expect(sidecarBootstrapToken(info)).toBeUndefined();
    }
  });
});

describe("readSidecarBootstrapToken", () => {
  it("reads the token of a sidecar the app runs", async () => {
    await expect(
      readSidecarBootstrapToken(async () => ({ values: { bootstrapToken: "t0k" } })),
    ).resolves.toBe("t0k");
  });

  it("is undefined when the app declares no server sidecar (T3_DESKTOP_SERVER=external)", async () => {
    await expect(
      readSidecarBootstrapToken(() => Promise.reject(new Error("unknown sidecar: server"))),
    ).resolves.toBeUndefined();
    await expect(readSidecarBootstrapToken(async () => ({ name: "server" }))).resolves.toBe(
      undefined,
    );
  });
});
