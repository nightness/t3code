import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { openExternalUrl } from "./nativeShell";

const IOS_ORIGIN = "capacitor://localhost";
const ANDROID_ORIGIN = "https://localhost";

function stubWindow(options: { readonly native: boolean; readonly origin?: string }) {
  const assign = vi.fn<(url: string) => void>();
  vi.stubGlobal("window", {
    Capacitor: { isNativePlatform: () => options.native },
    location: { origin: options.origin ?? IOS_ORIGIN, assign },
  });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openExternalUrl", () => {
  it.each([
    "https://github.com/pingdotgg/t3code/pull/1",
    "http://192.168.1.20:3773/docs",
    "mailto:support@example.com",
    "tel:+15555550100",
  ])("navigates to %s from the native shell so Capacitor hands it to the system", (url) => {
    const assign = stubWindow({ native: true });

    expect(openExternalUrl(url)).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith(url);
  });

  it("navigates to the parsed URL, not the raw input", () => {
    const assign = stubWindow({ native: true });

    expect(openExternalUrl("  HTTPS://Example.COM/a b")).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://example.com/a%20b");
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<p>hi</p>",
    "blob:capacitor://localhost/2d7c1f0e",
    "vscode://vscode-remote/ssh-remote+host/repo",
    "capacitor://localhost/settings",
    "file:///etc/hosts",
  ])("leaves %s to the caller", (url) => {
    const assign = stubWindow({ native: true });

    expect(openExternalUrl(url)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(["/settings", "settings", "#top", "?q=1", "//example.com/x", "", "not a url"])(
    "leaves the relative or unparsable %j to the caller",
    (url) => {
      const assign = stubWindow({ native: true });

      expect(openExternalUrl(url)).toBe(false);
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it("keeps an app-origin URL, which would replace the app instead of opening a browser", () => {
    const assign = stubWindow({ native: true, origin: ANDROID_ORIGIN });

    expect(openExternalUrl("https://localhost/settings")).toBe(false);
    expect(openExternalUrl("https://localhost:8443/settings")).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith("https://localhost:8443/settings");
  });

  it("does nothing outside the native shell", () => {
    const assign = stubWindow({ native: false });
    expect(openExternalUrl("https://example.com/")).toBe(false);

    vi.stubGlobal("window", { location: { origin: "https://app.t3.codes", assign } });
    expect(openExternalUrl("https://example.com/")).toBe(false);

    expect(assign).not.toHaveBeenCalled();
  });

  it("does nothing without a window", () => {
    vi.stubGlobal("window", undefined);

    expect(openExternalUrl("https://example.com/")).toBe(false);
  });
});
