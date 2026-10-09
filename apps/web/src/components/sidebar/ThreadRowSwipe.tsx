import type { ScopedThreadRef } from "@t3tools/contracts";
import type { TimestampFormat } from "@t3tools/contracts/settings";
import type { ReactNode } from "react";

import type { SnoozePreset } from "../Sidebar.snooze";
import type { ThreadRowSwipeState } from "./threadRowSwipe.logic";

export interface ThreadRowSwipeProps extends ThreadRowSwipeState {
  readonly threadRef: ScopedThreadRef;
  readonly threadTitle: string;
  readonly timestampFormat: TimestampFormat;
  /** Holds the swipe off, e.g. while the row is renamed or dragged. */
  readonly disabled: boolean;
  readonly onSettle: (threadRef: ScopedThreadRef) => void;
  readonly onUnsettle: (threadRef: ScopedThreadRef) => void;
  readonly onUnsnooze: (threadRef: ScopedThreadRef) => void;
  readonly onSnooze: (preset: Pick<SnoozePreset, "snoozedUntil">) => void;
  readonly children: ReactNode;
}

/**
 * A sidebar thread row's swipe actions. The web and desktop builds keep the row's hover
 * actions and render it as it is; the iOS and Android exports resolve ./ThreadRowSwipe.mobile.tsx
 * (denext's platform files), apps/mobile's swipe actions on the phone thread list.
 */
export function ThreadRowSwipe(props: ThreadRowSwipeProps): ReactNode {
  return props.children;
}
