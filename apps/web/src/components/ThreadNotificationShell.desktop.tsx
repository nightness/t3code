// The Deno Desktop exports' variant of ./ThreadNotificationShell.tsx (denext's platform files).
// Thread alerts are the OS's own notifications through denext (the `notifications` capability)
// with #16800's "Mute notifications" as their button, so a noisy thread can be muted from the
// alert itself. A click opens the thread, as the web alert's does. Opening or muting a thread
// (on any device) clears its alerts.
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import {
  onLocalNotificationTapped,
  removeDeliveredNotifications,
  scheduleNotification,
  setNotificationCategories,
} from "denext/mobile";
import { useEffect } from "react";

import { readEnvironmentSupportsMute, readThreadShell } from "../state/entities";
import { readEnvironmentScope } from "../state/session";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import {
  parseThreadNotificationData,
  THREAD_NOTIFICATION_CATEGORIES,
  THREAD_NOTIFICATION_CATEGORY,
  THREAD_NOTIFICATION_MUTE_ACTION,
  threadNotificationData,
  threadNotificationThreadId,
} from "../threadNotificationShell.logic";
import type { ShellThreadAlertInput, ThreadAlert } from "./ThreadNotificationShell";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { useThreadNotificationClearing } from "./useThreadNotificationClearing";

export type { ShellThreadAlertInput, ThreadAlert } from "./ThreadNotificationShell";

const ignore = () => {};

export function postShellThreadAlert(input: ShellThreadAlertInput): ThreadAlert {
  const threadId = threadNotificationThreadId(input.ref);
  const posted = scheduleNotification({
    title: input.title,
    body: input.body,
    threadId,
    categoryId: THREAD_NOTIFICATION_CATEGORY,
    data: threadNotificationData(input.ref),
  });
  posted.catch(ignore);
  return {
    tag: threadId,
    // By its own id, so replacing a thread's alert never removes the new one.
    close: () => {
      void posted.then((id) => removeDeliveredNotifications({ ids: [id] })).catch(ignore);
    },
  };
}

export function ThreadNotificationShell(): null {
  useThreadNotificationClearing();
  const navigate = useNavigate();
  const setThreadMuted = useOrchestrationCommand(threadEnvironment.setMuted, {
    reportFailure: false,
  });

  useEffect(() => {
    void setNotificationCategories(THREAD_NOTIFICATION_CATEGORIES).catch(ignore);
  }, []);

  useEffect(
    () =>
      onLocalNotificationTapped(
        (tap) => {
          // The payload is untrusted: act only on a thread this client has.
          const ref = parseThreadNotificationData(tap.notification.data);
          if (ref === null || readThreadShell(ref) === null) return;
          if (tap.actionId === THREAD_NOTIFICATION_MUTE_ACTION) {
            if (
              !readEnvironmentSupportsMute(ref.environmentId) ||
              !readEnvironmentScope(ref.environmentId, AuthOrchestrationOperateScope)
            ) {
              return;
            }
            void setThreadMuted({
              environmentId: ref.environmentId,
              input: { threadId: ref.threadId, muted: true },
            }).then((result) => {
              if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
              const error = squashAtomCommandFailure(result);
              toastManager.add(
                stackedThreadToast({
                  type: "error",
                  title: "Failed to update notifications",
                  description: error instanceof Error ? error.message : "An error occurred.",
                }),
              );
            });
            return;
          }
          if (tap.actionId !== "tap") return;
          window.focus();
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId: ref.environmentId, threadId: ref.threadId },
          });
        },
        { route: false },
      ),
    [navigate, setThreadMuted],
  );
  return null;
}
