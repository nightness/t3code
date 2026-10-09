import type { ContextMenuItem } from "@t3tools/contracts";

import type { SnoozePreset } from "../Sidebar.snooze";

/** The lifecycle verb a sidebar row's section gives it: cards settle, settled rows un-settle, snoozed rows wake. */
export type ThreadRowLifecycleAction = "settle" | "unsettle" | "unsnooze";

/** What the row knows about the swipe, as `ThreadRowSwipe` receives it. */
export interface ThreadRowSwipeState {
  readonly variantAction: ThreadRowLifecycleAction;
  /** The user may operate threads in this environment. */
  readonly canOperate: boolean;
  /** False on servers that predate thread.settle / thread.unsettle. */
  readonly settlementSupported: boolean;
  /** Snooze is offered: capability-gated and never on blocked or queued work. */
  readonly snoozable: boolean;
}

export interface ThreadRowSwipeActions {
  /** The action the swipe advertises first and a full swipe commits; `null` turns the swipe off. */
  readonly primary: ThreadRowLifecycleAction | null;
  /** Whether Snooze sits beside it. */
  readonly snooze: boolean;
}

/**
 * The phone thread list's swipe actions, as apps/mobile resolves them
 * (`resolveThreadListV2SwipeActions` in features/threads/threadListV2.ts): a snoozed row wakes
 * and offers nothing else; any other row settles (a card) or un-settles (a settled row), with
 * Snooze beside it while the thread can be snoozed. A server without settlement gets no swipe
 * here: apps/mobile falls back to Archive, which the web row has no handler for.
 */
export function resolveThreadRowSwipeActions(state: ThreadRowSwipeState): ThreadRowSwipeActions {
  if (!state.canOperate) return { primary: null, snooze: false };
  if (state.variantAction === "unsnooze") return { primary: "unsnooze", snooze: false };
  if (!state.settlementSupported) return { primary: null, snooze: false };
  return { primary: state.variantAction, snooze: state.snoozable };
}

/** apps/mobile's label for each action (thread-list-v2-items.tsx). */
export const THREAD_ROW_SWIPE_LABELS: Readonly<
  Record<ThreadRowLifecycleAction | "snooze", string>
> = {
  settle: "Settle",
  unsettle: "Un-settle",
  unsnooze: "Wake",
  snooze: "Snooze",
};

/** The accessible name of an action, as apps/mobile words it ("Settle <title>", "Wake <title> now"). */
export function threadRowSwipeAccessibilityLabel(
  action: ThreadRowLifecycleAction | "snooze",
  threadTitle: string,
): string {
  switch (action) {
    case "settle":
      return `Settle ${threadTitle}`;
    case "unsettle":
      return `Un-settle ${threadTitle}`;
    case "unsnooze":
      return `Wake ${threadTitle} now`;
    case "snooze":
      return `Choose when to snooze ${threadTitle}`;
  }
}

export type SnoozeMenuItemId = `snooze:${string}`;

/**
 * The Snooze action's menu: the same presets and "Custom…" as the row's context menu
 * (threadActionMenu.logic.ts), which apps/mobile's swipe Snooze also opens ("Snooze until").
 */
export function buildSnoozeSwipeMenuItems(
  presets: ReadonlyArray<SnoozePreset>,
): ContextMenuItem<SnoozeMenuItemId>[] {
  return [
    ...presets.map((preset) => ({
      id: `snooze:${preset.id}` as const,
      label: `${preset.label} (${preset.whenLabel})`,
    })),
    { id: "snooze:custom", label: "Custom…", separatorBefore: true },
  ];
}

/** The preset a menu pick names: `"custom"` for Custom…, `null` for a dismissal or an unknown id. */
export function resolveSnoozeSwipeChoice(
  picked: string | null,
  presets: ReadonlyArray<SnoozePreset>,
): SnoozePreset | "custom" | null {
  if (picked === null) return null;
  if (picked === "snooze:custom") return "custom";
  return presets.find((preset) => `snooze:${preset.id}` === picked) ?? null;
}
