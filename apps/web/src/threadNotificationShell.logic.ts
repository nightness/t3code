import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";

/**
 * A thread's notification thread id, as the relay's APNs payload sets `aps.thread-id`
 * (infra/relay ApnsClient `notificationThreadId`): `<environmentId>/<threadId>`. Local
 * notifications use the same id, so one call clears a thread's pushes and local alerts alike.
 */
export function threadNotificationThreadId(ref: ScopedThreadRef): string {
  return `${ref.environmentId}/${ref.threadId}`;
}

/** The category of a thread's alerts, with #16800's mute as its button. */
export const THREAD_NOTIFICATION_CATEGORY = "t3code.thread";
export const THREAD_NOTIFICATION_MUTE_ACTION = "mute";

export const THREAD_NOTIFICATION_CATEGORIES = [
  {
    id: THREAD_NOTIFICATION_CATEGORY,
    // #16800's wording for the same action in the thread menus.
    actions: [{ id: THREAD_NOTIFICATION_MUTE_ACTION, title: "Mute notifications" }],
  },
] as const;

/** The payload a thread alert carries, so a tap or its Mute button finds the thread. */
export function threadNotificationData(ref: ScopedThreadRef): Record<string, string> {
  return { environmentId: ref.environmentId, threadId: ref.threadId };
}

/**
 * The thread a tapped notification names, or `null`. A tap's payload is untrusted input (another
 * process of the same user can forge a desktop notification activation), so only two non-empty
 * id strings without a path separator are accepted; the caller still checks the thread exists.
 */
export function parseThreadNotificationData(data: unknown): ScopedThreadRef | null {
  if (typeof data !== "object" || data === null) return null;
  const { environmentId, threadId } = data as Record<string, unknown>;
  const valid = (value: unknown): value is string =>
    typeof value === "string" && value.length > 0 && value.length <= 256 && !/[/\s]/.test(value);
  if (!valid(environmentId) || !valid(threadId)) return null;
  return {
    environmentId: environmentId as EnvironmentId,
    threadId: threadId as ThreadId,
  };
}

/** The muted threads' notification thread ids. */
export function mutedThreadNotificationIds(
  threads: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
    readonly mutedAt?: string | null;
  }>,
): Set<string> {
  const muted = new Set<string>();
  for (const thread of threads) {
    if (thread.mutedAt != null) {
      muted.add(
        threadNotificationThreadId({ environmentId: thread.environmentId, threadId: thread.id }),
      );
    }
  }
  return muted;
}

/** The thread ids in `next` that `previous` did not have: the threads muted since. */
export function newlyMuted(previous: ReadonlySet<string>, next: ReadonlySet<string>): string[] {
  return [...next].filter((id) => !previous.has(id));
}
