import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_EXTERNAL_SERVER_URL,
  desktopServerMode,
  desktopServerProxy,
  desktopServerSelection,
  externalServerUrl,
  isLoopbackUrl,
} from "./desktopServerMode";

describe("desktopServerMode", () => {
  it("defaults to the sidecar", () => {
    expect(desktopServerMode({})).toBe("sidecar");
    expect(desktopServerMode({ T3_DESKTOP_SERVER: "" })).toBe("sidecar");
    expect(desktopServerMode({ T3_DESKTOP_SERVER: "sidecar" })).toBe("sidecar");
  });

  it("selects external, ignoring case and whitespace", () => {
    expect(desktopServerMode({ T3_DESKTOP_SERVER: "external" })).toBe("external");
    expect(desktopServerMode({ T3_DESKTOP_SERVER: " External " })).toBe("external");
  });

  it("rejects an unknown value instead of picking a mode", () => {
    expect(() => desktopServerMode({ T3_DESKTOP_SERVER: "remote" })).toThrow(/sidecar.*external/);
  });
});

describe("externalServerUrl", () => {
  it("defaults to the server t3 serve leaves on 3773", () => {
    expect(externalServerUrl({})).toBe(DEFAULT_EXTERNAL_SERVER_URL);
    expect(DEFAULT_EXTERNAL_SERVER_URL).toBe("http://127.0.0.1:3773");
  });

  it("takes T3_DESKTOP_SERVER_URL as an origin", () => {
    expect(externalServerUrl({ T3_DESKTOP_SERVER_URL: "http://127.0.0.1:4000/" })).toBe(
      "http://127.0.0.1:4000",
    );
    expect(externalServerUrl({ T3_DESKTOP_SERVER_URL: "https://t3.example.com" })).toBe(
      "https://t3.example.com",
    );
  });

  it("rejects what is not an http(s) origin", () => {
    expect(() => externalServerUrl({ T3_DESKTOP_SERVER_URL: "nope" })).toThrow(/not a URL/);
    expect(() => externalServerUrl({ T3_DESKTOP_SERVER_URL: "ftp://x" })).toThrow(/http/);
    expect(() => externalServerUrl({ T3_DESKTOP_SERVER_URL: "http://x/api" })).toThrow(/path/);
  });
});

describe("isLoopbackUrl", () => {
  it("knows loopback hosts", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3773")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3773")).toBe(true);
    expect(isLoopbackUrl("http://192.168.1.4:3773")).toBe(false);
  });
});

describe("desktopServerSelection", () => {
  it("keeps the sidecar and the 3773 dev target by default", () => {
    expect(desktopServerSelection({})).toEqual({
      mode: "sidecar",
      proxyTarget: "http://127.0.0.1:3773",
      proxyAllowNonLoopback: false,
      sidecar: true,
    });
  });

  it("external mode drops the sidecar and proxies to the given server", () => {
    expect(
      desktopServerSelection({
        T3_DESKTOP_SERVER: "external",
        T3_DESKTOP_SERVER_URL: "http://127.0.0.1:4100",
      }),
    ).toEqual({
      mode: "external",
      proxyTarget: "http://127.0.0.1:4100",
      proxyAllowNonLoopback: false,
      sidecar: false,
    });
  });

  it("external mode allows a non-loopback server explicitly", () => {
    expect(
      desktopServerSelection({
        T3_DESKTOP_SERVER: "external",
        T3_DESKTOP_SERVER_URL: "http://10.0.0.5:3773",
      }).proxyAllowNonLoopback,
    ).toBe(true);
  });

  it("ignores T3_DESKTOP_SERVER_URL in sidecar mode", () => {
    expect(desktopServerSelection({ T3_DESKTOP_SERVER_URL: "http://127.0.0.1:4100" }).sidecar).toBe(
      true,
    );
  });
});

describe("desktopServerProxy", () => {
  it("carries the target, and allowNonLoopback only when needed", () => {
    expect(
      desktopServerProxy(
        desktopServerSelection({
          T3_DESKTOP_SERVER: "external",
          T3_DESKTOP_SERVER_URL: "http://127.0.0.1:4100",
        }),
      ),
    ).toEqual({ target: "http://127.0.0.1:4100" });
    expect(
      desktopServerProxy(
        desktopServerSelection({
          T3_DESKTOP_SERVER: "external",
          T3_DESKTOP_SERVER_URL: "http://10.0.0.5:3773",
        }),
      ),
    ).toEqual({ target: "http://10.0.0.5:3773", allowNonLoopback: true });
    expect(desktopServerProxy(desktopServerSelection({}))).toEqual({
      target: "http://127.0.0.1:3773",
    });
  });
});
