import { describe, expect, it } from "vite-plus/test";

import {
  NATIVE_BACKGROUND_RECONNECT_AFTER_MS,
  type NativeApplicationActiveWakeup,
  nativeApplicationActiveWakeup,
  subscribeNativeResumeWakeups,
} from "./nativeWakeups";

describe("nativeApplicationActiveWakeup", () => {
  it("probes when the app was never recorded as hidden", () => {
    expect(nativeApplicationActiveWakeup(null, 50_000)).toBe("application-active-probe");
  });

  it("probes after a background shorter than ten seconds", () => {
    expect(
      nativeApplicationActiveWakeup(1_000, 1_000 + NATIVE_BACKGROUND_RECONNECT_AFTER_MS - 1),
    ).toBe("application-active-probe");
  });

  it("reconnects after ten seconds or more in the background", () => {
    expect(NATIVE_BACKGROUND_RECONNECT_AFTER_MS).toBe(10_000);
    expect(nativeApplicationActiveWakeup(1_000, 11_000)).toBe("application-active-reconnect");
    expect(nativeApplicationActiveWakeup(1_000, 600_000)).toBe("application-active-reconnect");
  });
});

describe("subscribeNativeResumeWakeups", () => {
  function makeLifecycle() {
    let now = 0;
    const target = Object.assign(new EventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    const offered: NativeApplicationActiveWakeup[] = [];
    const unsubscribe = subscribeNativeResumeWakeups(
      target,
      (wakeup) => offered.push(wakeup),
      () => now,
    );
    const at = (ms: number) => {
      now = ms;
    };
    const setVisibility = (state: DocumentVisibilityState) => {
      target.visibilityState = state;
      target.dispatchEvent(new Event("visibilitychange"));
    };
    const capacitor = (name: "pause" | "resume") => target.dispatchEvent(new Event(name));
    return { at, setVisibility, capacitor, offered, unsubscribe };
  }

  it("offers one wakeup per return, whichever of visibilitychange and resume comes first", () => {
    const lifecycle = makeLifecycle();

    lifecycle.at(1_000);
    lifecycle.setVisibility("hidden");
    lifecycle.at(1_500);
    lifecycle.capacitor("pause"); // later leave signal: the earliest one is kept
    lifecycle.at(11_000);
    lifecycle.capacitor("resume");
    lifecycle.at(11_050);
    lifecycle.setVisibility("visible");

    lifecycle.at(20_000);
    lifecycle.capacitor("pause");
    lifecycle.setVisibility("hidden");
    lifecycle.at(29_999);
    lifecycle.setVisibility("visible");
    lifecycle.capacitor("resume");

    expect(lifecycle.offered).toEqual(["application-active-reconnect", "application-active-probe"]);
  });

  it("ignores a return that was not preceded by leaving", () => {
    const lifecycle = makeLifecycle();

    lifecycle.setVisibility("visible");
    lifecycle.capacitor("resume");

    expect(lifecycle.offered).toEqual([]);
  });

  it("stops listening once unsubscribed", () => {
    const lifecycle = makeLifecycle();

    lifecycle.unsubscribe();
    lifecycle.setVisibility("hidden");
    lifecycle.setVisibility("visible");

    expect(lifecycle.offered).toEqual([]);
  });
});
