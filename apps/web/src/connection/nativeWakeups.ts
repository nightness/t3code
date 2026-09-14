import type { Wakeups } from "@t3tools/client-runtime/connection";

/**
 * Resume wakeups for the Capacitor native shell, mirroring the React Native app
 * (apps/mobile/src/connection/app-state-wakeups.ts, `MOBILE_BACKGROUND_RECONNECT_AFTER_MS`, and
 * its AppState wiring in apps/mobile/src/connection/platform.ts). iOS commonly suspends a
 * backgrounded app's sockets without delivering a close event, so after a long background the
 * connection supervisor replaces the lease outright ("application-active-reconnect") instead of
 * waiting out a health-check probe. A short trip away only gets the quick mobile probe.
 */
export const NATIVE_BACKGROUND_RECONNECT_AFTER_MS = 10_000;

export type NativeApplicationActiveWakeup = Extract<
  Wakeups.ConnectionWakeup,
  "application-active-probe" | "application-active-reconnect"
>;

export function nativeApplicationActiveWakeup(
  hiddenAtMs: number | null,
  activeAtMs: number,
): NativeApplicationActiveWakeup {
  return hiddenAtMs !== null && activeAtMs - hiddenAtMs >= NATIVE_BACKGROUND_RECONNECT_AFTER_MS
    ? "application-active-reconnect"
    : "application-active-probe";
}

interface NativeLifecycleTarget extends EventTarget {
  readonly visibilityState: DocumentVisibilityState;
}

/**
 * Offers one wakeup per return to the foreground. Leaving is recorded on
 * `visibilitychange` → hidden or Capacitor's `pause` document event (the earliest one wins);
 * returning is `visibilitychange` → visible or Capacitor's `resume` document event, whichever
 * arrives first; the second of the pair finds nothing recorded and is ignored.
 */
export function subscribeNativeResumeWakeups(
  target: NativeLifecycleTarget,
  offer: (wakeup: NativeApplicationActiveWakeup) => void,
  now: () => number = Date.now,
): () => void {
  let hiddenAtMs: number | null = null;
  let away = false;

  const onLeave = () => {
    if (away) return;
    away = true;
    hiddenAtMs = now();
  };
  const onReturn = () => {
    if (!away) return;
    away = false;
    offer(nativeApplicationActiveWakeup(hiddenAtMs, now()));
    hiddenAtMs = null;
  };
  const onVisibilityChange = () => {
    if (target.visibilityState === "hidden") onLeave();
    else if (target.visibilityState === "visible") onReturn();
  };

  target.addEventListener("visibilitychange", onVisibilityChange);
  target.addEventListener("pause", onLeave);
  target.addEventListener("resume", onReturn);
  return () => {
    target.removeEventListener("visibilitychange", onVisibilityChange);
    target.removeEventListener("pause", onLeave);
    target.removeEventListener("resume", onReturn);
  };
}
