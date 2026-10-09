import type { ScopedThreadRef } from "@t3tools/contracts";

/** A thread alert the coordinator tracks: replaced by its tag, closed on focus. */
export interface ThreadAlert {
  readonly tag: string;
  close(): void;
}

export interface ShellThreadAlertInput {
  readonly ref: ScopedThreadRef;
  readonly title: string;
  readonly body: string;
}

/**
 * Thread alerts through the native shell. The web and Electron builds post them with the
 * Notifications API in ThreadNotificationCoordinator, so this posts nothing (`null`). The Deno
 * Desktop exports resolve ./ThreadNotificationShell.desktop.tsx (alerts with #16800's Mute
 * button) and the iOS / Android exports ./ThreadNotificationShell.mobile.tsx (clearing a
 * thread's delivered pushes), through denext's platform files.
 */
export function postShellThreadAlert(_input: ShellThreadAlertInput): ThreadAlert | null {
  return null;
}

/** The shell's side of thread alerts (taps, Mute, clearing); nothing on the web. */
export function ThreadNotificationShell(): null {
  return null;
}
