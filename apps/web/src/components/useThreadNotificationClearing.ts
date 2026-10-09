// Shared by the desktop and phone variants of ./ThreadNotificationShell.tsx (never imported by
// the web build): a thread's delivered notifications, pushes included, leave the notification
// centre when the thread is opened or muted (on any device; #16800 syncs the mute).
import { useParams } from "@tanstack/react-router";
import { deliveredNotifications, removeDeliveredNotifications } from "denext/mobile";
import { useEffect, useMemo, useRef } from "react";

import { useThreadShells } from "../state/entities";
import {
  mutedThreadNotificationIds,
  newlyMuted,
  threadNotificationThreadId,
} from "../threadNotificationShell.logic";
import { resolveThreadRouteRef } from "../threadRoutes";

const ignore = () => {};

/** Remove the delivered notifications of these threads in one pass. */
async function clearThreads(threadIds: ReadonlySet<string>): Promise<void> {
  if (threadIds.size === 0) return;
  const ids = (await deliveredNotifications())
    .filter((notification) => notification.threadId && threadIds.has(notification.threadId))
    .map((notification) => notification.id);
  if (ids.length > 0) await removeDeliveredNotifications({ ids });
}

export function useThreadNotificationClearing(): void {
  // The open thread: cleared when it opens and whenever the app comes back to it.
  const openRef = useParams({ strict: false, select: (params) => resolveThreadRouteRef(params) });
  const openThreadId = openRef ? threadNotificationThreadId(openRef) : null;
  useEffect(() => {
    if (openThreadId === null) return;
    const clear = () => {
      if (document.visibilityState !== "visible") return;
      void removeDeliveredNotifications({ threadId: openThreadId }).catch(ignore);
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [openThreadId]);

  // Muted threads: the first look clears what a mute made while the app was closed left behind,
  // later looks clear the threads muted since.
  const threads = useThreadShells();
  const muted = useMemo(() => mutedThreadNotificationIds(threads), [threads]);
  const previous = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = muted;
    const cleared = before === null ? muted : new Set(newlyMuted(before, muted));
    void clearThreads(cleared).catch(ignore);
  }, [muted]);
}
