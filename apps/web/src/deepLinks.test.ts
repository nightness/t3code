import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  useDeepLink: vi.fn(),
  usePushTapped: vi.fn(),
  isNativeShell: vi.fn(),
}));

vi.mock("denext/mobile", () => ({
  useDeepLink: mocks.useDeepLink,
  usePushTapped: mocks.usePushTapped,
}));
vi.mock("./nativeShell", () => ({ isNativeShell: mocks.isNativeShell }));

import { deepLinkHref, pushTapHref, useNativeDeepLinks, useNativePushTaps } from "./deepLinks";
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

  // The Clerk sign-in sheet's callback (t3code://app/?rotating_token_nonce=…): the sheet itself
  // and denext's in-flight auth-session claim keep it from the deep-link router, and it maps to
  // no route here either.
  it.each(["/app/?rotating_token_nonce=nonce", "/app/?__clerk_status=failed", "/app"])(
    "ignores the Clerk sign-in callback %s",
    (path) => {
      expect(deepLinkHref(path)).toBeNull();
    },
  );

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

describe("pushTapHref", () => {
  it("opens the thread in the relay's APNs payload", () => {
    expect(
      pushTapHref({
        aps: { alert: { title: "Agent finished", body: "Done" } },
        environmentId: "env 1",
        threadId: "thread/2",
        deepLink: "/threads/env%201/thread%2F2",
      }),
    ).toBe("/env%201/thread%2F2");
  });

  it.each([
    ["no deepLink", {}],
    ["a non-string deepLink", { deepLink: 42 }],
    ["the relay's fallback path", { deepLink: "/" }],
    ["an unmapped path", { deepLink: "/settings" }],
    ["a protocol-relative URL", { deepLink: "//evil.example/threads/a/b" }],
  ])("ignores a payload with %s", (_label, data) => {
    expect(pushTapHref(data)).toBeNull();
  });
});

describe("useNativePushTaps", () => {
  const navigate = vi.fn();
  const router = { navigate } as unknown as AppRouter;

  function subscribed() {
    useNativePushTaps(router);
    expect(mocks.usePushTapped).toHaveBeenCalledOnce();
    const [callback, options] = mocks.usePushTapped.mock.calls[0]! as [
      (tap: { notification: { data: Record<string, unknown> }; actionId: string }) => void,
      { readonly route: unknown },
    ];
    return { callback, options };
  }

  function tap(data: Record<string, unknown>) {
    return { notification: { data }, actionId: "tap" };
  }

  beforeEach(() => {
    mocks.isNativeShell.mockReturnValue(true);
    navigate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("leaves routing to the app, not denext", () => {
    expect(subscribed().options).toEqual({ route: false });
  });

  it("navigates the router to the tapped thread", () => {
    const { callback } = subscribed();

    callback(tap({ deepLink: "/threads/env/thread" }));

    expect(navigate).toHaveBeenCalledExactlyOnceWith({ href: "/env/thread" });
  });

  it("ignores a tap without a thread", () => {
    const { callback } = subscribed();

    callback(tap({ deepLink: "/" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it("does nothing outside the native shell", () => {
    const { callback } = subscribed();
    mocks.isNativeShell.mockReturnValue(false);

    callback(tap({ deepLink: "/threads/env/thread" }));

    expect(navigate).not.toHaveBeenCalled();
  });
});
