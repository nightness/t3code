import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  useDeepLink: vi.fn(),
  isNativeShell: vi.fn(),
}));

vi.mock("denext/mobile", () => ({ useDeepLink: mocks.useDeepLink }));
vi.mock("./nativeShell", () => ({ isNativeShell: mocks.isNativeShell }));

import { deepLinkHref, useNativeDeepLinks } from "./deepLinks";
import type { AppRouter } from "./router";

const HOSTED_PAIRING_URL =
  "https://app.t3.codes/pair?host=https%3A%2F%2Fdesktop.tailnet.ts.net%2F&label=Desk#token=pairing-token";

function pairLink(pairingUrl: string): string {
  return `/pair?pairingUrl=${encodeURIComponent(pairingUrl)}`;
}

describe("deepLinkHref", () => {
  it("opens a thread link on the thread route", () => {
    expect(deepLinkHref("/threads/env-1/thread-1")).toBe("/env-1/thread-1");
  });

  it("re-encodes thread ids the way the React Native app encodes them", () => {
    expect(deepLinkHref("/threads/env%201/thread%2F2")).toBe("/env%201/thread%2F2");
  });

  it("drops a thread link's query and hash", () => {
    expect(deepLinkHref("/threads/env/thread?x=1#y")).toBe("/env/thread");
  });

  it.each([
    "/threads",
    "/threads/env",
    "/threads/env/",
    "/threads//thread",
    "/threads/env/thread/terminal",
    "/threads/%E0%A4%A/thread",
  ])("ignores the malformed thread link %s", (path) => {
    expect(deepLinkHref(path)).toBeNull();
  });

  // Pairing links auto-pair on load, so they are never followed (as in the RN production app).
  it.each([
    ["a hosted pairing URL", pairLink(HOSTED_PAIRING_URL)],
    ["a direct pairing URL", pairLink("http://192.168.1.20:3773/pair#token=abc")],
    ["a query-token pairing URL", pairLink("https://remote.example.com/?token=abc")],
    ["no pairingUrl", "/pair"],
    ["an empty pairingUrl", "/pair?pairingUrl="],
    ["a non-http pairing URL", pairLink("javascript:alert(1)#token=x")],
  ])("ignores a pairing link with %s", (_label, path) => {
    expect(deepLinkHref(path)).toBeNull();
  });

  it.each(["/", "/settings", "/settings/usage?tab=limits", "/env/thread", "//evil.example/x"])(
    "ignores the unmapped link %s",
    (path) => {
      expect(deepLinkHref(path)).toBeNull();
    },
  );
});

describe("useNativeDeepLinks", () => {
  const navigate = vi.fn();
  const router = { navigate } as unknown as AppRouter;

  function subscribedOptions() {
    useNativeDeepLinks(router);
    expect(mocks.useDeepLink).toHaveBeenCalledOnce();
    return mocks.useDeepLink.mock.calls[0]![1] as {
      readonly accept: (url: URL) => boolean;
      readonly route: (path: string, url: URL) => void;
    };
  }

  beforeEach(() => {
    mocks.isNativeShell.mockReturnValue(true);
    navigate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("accepts only t3code links, and only in the native shell", () => {
    const { accept } = subscribedOptions();

    expect(accept(new URL("t3code://threads/env/thread"))).toBe(true);
    expect(accept(new URL("t3code-dev://threads/env/thread"))).toBe(false);
    expect(accept(new URL("https://app.t3.codes/pair"))).toBe(false);

    mocks.isNativeShell.mockReturnValue(false);
    expect(accept(new URL("t3code://threads/env/thread"))).toBe(false);
  });

  it("navigates the router to a mapped link", () => {
    const { route } = subscribedOptions();

    route("/threads/env/thread", new URL("t3code://threads/env/thread"));

    expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: "/env/thread" });
  });

  it("does not navigate for an unmapped link", () => {
    const { route } = subscribedOptions();

    route("/settings", new URL("t3code://settings"));

    expect(navigate).not.toHaveBeenCalled();
  });
});
