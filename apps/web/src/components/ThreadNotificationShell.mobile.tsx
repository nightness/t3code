// The iOS and Android exports' variant of ./ThreadNotificationShell.tsx (denext's platform
// files). Phone alerts are the relay's pushes, not local notifications, so nothing is posted
// here; opening or muting a thread clears its delivered pushes (APNs `thread-id` is
// `<environmentId>/<threadId>`). The pushes' own Mute button would need the relay to send
// `aps.category`, which is the relay's change to make, not this app's.
import { useThreadNotificationClearing } from "./useThreadNotificationClearing";

import type { ShellThreadAlertInput } from "./ThreadNotificationShell";

export type { ShellThreadAlertInput, ThreadAlert } from "./ThreadNotificationShell";

export function postShellThreadAlert(_input: ShellThreadAlertInput): null {
  return null;
}

export function ThreadNotificationShell(): null {
  useThreadNotificationClearing();
  return null;
}
