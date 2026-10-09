// The iOS and Android exports' variant of ./ThreadRowSwipe.tsx (denext's platform files): the phone
// thread list's swipe actions, as apps/mobile draws them (features/home/thread-swipe-actions.tsx).
// A leftward swipe reveals the row's lifecycle action (Settle, Un-settle, or Wake) with Snooze
// beside it while the thread can be snoozed, and a full swipe commits the lifecycle action. Each
// action is apps/mobile's: a filled circle with the icon (primary for the lifecycle action,
// secondary for Snooze) over an 11 px muted label, on the list's own surface, 58 px wide
// (36 px circles, 28 px on compact settled rows). Snooze opens the presets menu ("Snooze until"
// there), the same presets and Custom… as the row's context menu.
import { SwipeableRow, type SwipeAction } from "denext";
import { CheckIcon, ClockIcon, Undo2Icon } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { readLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { requestCustomSnooze } from "../CustomSnoozeDialog";
import { resolveSnoozePresets } from "../Sidebar.snooze";
import type { ThreadRowSwipeProps } from "./ThreadRowSwipe";
import {
  buildSnoozeSwipeMenuItems,
  resolveSnoozeSwipeChoice,
  resolveThreadRowSwipeActions,
  THREAD_ROW_SWIPE_LABELS,
  threadRowSwipeAccessibilityLabel,
  type ThreadRowLifecycleAction,
} from "./threadRowSwipe.logic";

export type { ThreadRowSwipeProps } from "./ThreadRowSwipe";

/** apps/mobile's ACTION_ITEM_WIDTH. */
const ACTION_WIDTH = 58;

const LIFECYCLE_ICONS: Record<ThreadRowLifecycleAction, typeof CheckIcon> = {
  settle: CheckIcon,
  unsettle: Undo2Icon,
  unsnooze: ClockIcon,
};

function ActionCircle(props: {
  readonly icon: typeof CheckIcon;
  readonly tone: "primary" | "secondary";
  readonly compact: boolean;
}) {
  const Icon = props.icon;
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full",
        props.compact ? "size-7" : "size-9",
        props.tone === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      <Icon className={props.compact ? "size-[13px]" : "size-[15px]"} strokeWidth={2.25} />
    </span>
  );
}

export function ThreadRowSwipe(props: ThreadRowSwipeProps): ReactNode {
  // The Snooze menu opens where the finger lifted, as a long-press menu does.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const actions = resolveThreadRowSwipeActions(props);
  if (actions.primary === null) return props.children;

  const compact = props.variantAction !== "settle";
  const primary = actions.primary;
  const commitPrimary = () => {
    if (primary === "settle") props.onSettle(props.threadRef);
    else if (primary === "unsettle") props.onUnsettle(props.threadRef);
    else props.onUnsnooze(props.threadRef);
  };
  const openSnoozeMenu = () => {
    void (async () => {
      const api = readLocalApi();
      if (!api) return;
      const presets = resolveSnoozePresets(new Date(), props.timestampFormat);
      const picked = await api.contextMenu
        .show(buildSnoozeSwipeMenuItems(presets), lastPointer.current ?? undefined)
        .catch(() => null);
      const choice = resolveSnoozeSwipeChoice(picked, presets);
      if (choice === "custom") {
        const custom = await requestCustomSnooze();
        if (custom) props.onSnooze(custom);
      } else if (choice) {
        props.onSnooze(choice);
      }
    })();
  };

  // SwipeableRow's first trailing action is the outermost one and the one a full swipe runs, so
  // the lifecycle action comes first (apps/mobile's full swipe also commits it).
  const trailing: SwipeAction[] = [
    {
      key: primary,
      label: THREAD_ROW_SWIPE_LABELS[primary],
      accessibilityLabel: threadRowSwipeAccessibilityLabel(primary, props.threadTitle),
      icon: <ActionCircle icon={LIFECYCLE_ICONS[primary]} tone="primary" compact={compact} />,
      background: "transparent",
      color: "var(--muted-foreground)",
      onPress: commitPrimary,
    },
    ...(actions.snooze
      ? [
          {
            key: "snooze",
            label: THREAD_ROW_SWIPE_LABELS.snooze,
            accessibilityLabel: threadRowSwipeAccessibilityLabel("snooze", props.threadTitle),
            icon: <ActionCircle icon={ClockIcon} tone="secondary" compact={compact} />,
            background: "transparent",
            color: "var(--muted-foreground)",
            onPress: openSnoozeMenu,
          } satisfies SwipeAction,
        ]
      : []),
  ];

  return (
    <div
      onPointerUpCapture={(event) => {
        lastPointer.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <SwipeableRow
        trailing={trailing}
        fullSwipe="trailing"
        actionWidth={ACTION_WIDTH}
        disabled={props.disabled}
        // apps/mobile's labels: text-3xs (11 / 14), medium weight.
        className="[&_[data-dnx-swipe-action]>span]:text-2xs! [&_[data-dnx-swipe-action]>span]:leading-3.5! [&_[data-dnx-swipe-action]>span]:gap-0.5!"
        // The row and its actions sit on the list's own surface (its grain shows through).
        style={{ "--dnx-swipe-row-bg": "transparent" }}
      >
        {props.children}
      </SwipeableRow>
    </div>
  );
}
