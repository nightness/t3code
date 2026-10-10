import { DesktopBackendBootstrap } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import {
  type DenextSidecarContext,
  type DesktopSidecarProcess,
  desktopSidecarBootstrap,
  prepareDesktopSidecarProcess,
  readDenextSidecar,
} from "./desktopSidecar.ts";

const decodeBootstrap = Schema.decodeSync(DesktopBackendBootstrap);

const sidecar = (overrides: Partial<DenextSidecarContext> = {}): DenextSidecarContext => ({
  name: "server",
  port: 41234,
  bootstrap: undefined,
  secrets: { BOOTSTRAP_SECRET: "secret", BOOTSTRAP_TOKEN: "token" },
  ready: () => undefined,
  onShutdown: () => undefined,
  ...overrides,
});

describe("readDenextSidecar", () => {
  it("reads denext's sidecar context", () => {
    const context = sidecar();
    expect(readDenextSidecar({ denextSidecar: context })).toBe(context);
  });

  it("is undefined outside a sidecar", () => {
    expect(readDenextSidecar({})).toBeUndefined();
    expect(readDenextSidecar({ denextSidecar: { name: "server" } })).toBeUndefined();
    expect(readDenextSidecar()).toBeUndefined();
  });
});

describe("desktopSidecarBootstrap", () => {
  it("builds the envelope apps/desktop sends on fd 3", () => {
    const envelope = desktopSidecarBootstrap(sidecar());
    expect(envelope).toEqual({
      mode: "desktop",
      noBrowser: true,
      port: 41234,
      host: "127.0.0.1",
      desktopBootstrapToken: "token",
      desktopBootstrapSecret: "secret",
      tailscaleServeEnabled: false,
      tailscaleServePort: 443,
    });
    // The server decodes it with the same schema as the fd envelope.
    expect(decodeBootstrap(envelope)).toEqual(envelope);
  });

  it("refuses a sidecar without a port or its secrets", () => {
    const { port: _port, ...portless } = sidecar();
    expect(() => desktopSidecarBootstrap(portless)).toThrow(/no port/);
    expect(() => desktopSidecarBootstrap(sidecar({ secrets: {} }))).toThrow(/BOOTSTRAP_SECRET/);
  });
});

describe("prepareDesktopSidecarProcess", () => {
  const makeProcess = (argv: string[]): DesktopSidecarProcess => ({
    argv,
    env: { PATH: "/usr/bin", T3CODE_HOME: "/tmp/home", T3CODE_PORT: "3773", T3CODE_MODE: "web" },
  });

  it("drops desktop-owned variables and keeps the rest", () => {
    const proc = makeProcess(["/app", "/app/main.mjs"]);
    prepareDesktopSidecarProcess(proc, "/Users/me");
    expect(proc.env).toEqual({ PATH: "/usr/bin", T3CODE_HOME: "/tmp/home" });
  });

  it("runs from the home directory unless given a working directory", () => {
    const bare = makeProcess(["/app", "/app/main.mjs"]);
    prepareDesktopSidecarProcess(bare, "/Users/me");
    expect(bare.argv).toEqual(["/app", "/app/main.mjs", "/Users/me"]);

    const given = makeProcess(["/app", "/app/main.mjs", "/work"]);
    prepareDesktopSidecarProcess(given, "/Users/me");
    expect(given.argv).toEqual(["/app", "/app/main.mjs", "/work"]);
  });
});
