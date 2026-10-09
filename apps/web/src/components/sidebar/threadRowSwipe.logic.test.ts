import { describe, expect, it } from "vite-plus/test";

import type { SnoozePreset } from "../Sidebar.snooze";
import {
  buildSnoozeSwipeMenuItems,
  resolveSnoozeSwipeChoice,
  resolveThreadRowSwipeActions,
  threadRowSwipeAccessibilityLabel,
  type ThreadRowSwipeState,
} from "./threadRowSwipe.logic";

const card: ThreadRowSwipeState = {
  variantAction: "settle",
  canOperate: true,
  settlementSupported: true,
  snoozable: true,
};

const presets: ReadonlyArray<SnoozePreset> = [
  { id: "hour", label: "In 1 hour", whenLabel: "10:00", snoozedUntil: "2026-10-09T10:00:00.000Z" },
  {
    id: "tomorrow",
    label: "Tomorrow",
    whenLabel: "9:00",
    snoozedUntil: "2026-10-10T09:00:00.000Z",
  },
];

describe("resolveThreadRowSwipeActions", () => {
  it("settles a card, with Snooze beside it", () => {
    expect(resolveThreadRowSwipeActions(card)).toEqual({ primary: "settle", snooze: true });
  });

  it("un-settles a settled row and keeps Snooze while it can be snoozed", () => {
    expect(resolveThreadRowSwipeActions({ ...card, variantAction: "unsettle" })).toEqual({
      primary: "unsettle",
      snooze: true,
    });
    expect(
      resolveThreadRowSwipeActions({ ...card, variantAction: "unsettle", snoozable: false }),
    ).toEqual({ primary: "unsettle", snooze: false });
  });

  it("wakes a snoozed row and offers nothing else", () => {
    expect(resolveThreadRowSwipeActions({ ...card, variantAction: "unsnooze" })).toEqual({
      primary: "unsnooze",
      snooze: false,
    });
  });

  it("drops Snooze on a thread that cannot be snoozed", () => {
    expect(resolveThreadRowSwipeActions({ ...card, snoozable: false })).toEqual({
      primary: "settle",
      snooze: false,
    });
  });

  it("turns the swipe off without the operate scope", () => {
    expect(resolveThreadRowSwipeActions({ ...card, canOperate: false })).toEqual({
      primary: null,
      snooze: false,
    });
    expect(
      resolveThreadRowSwipeActions({ ...card, variantAction: "unsnooze", canOperate: false }),
    ).toEqual({ primary: null, snooze: false });
  });

  it("turns the swipe off on a server without settlement, except to wake", () => {
    expect(resolveThreadRowSwipeActions({ ...card, settlementSupported: false })).toEqual({
      primary: null,
      snooze: false,
    });
    expect(
      resolveThreadRowSwipeActions({
        ...card,
        variantAction: "unsnooze",
        settlementSupported: false,
      }),
    ).toEqual({ primary: "unsnooze", snooze: false });
  });
});

describe("threadRowSwipeAccessibilityLabel", () => {
  it("words each action as apps/mobile does", () => {
    expect(threadRowSwipeAccessibilityLabel("settle", "Fix login")).toBe("Settle Fix login");
    expect(threadRowSwipeAccessibilityLabel("unsettle", "Fix login")).toBe("Un-settle Fix login");
    expect(threadRowSwipeAccessibilityLabel("unsnooze", "Fix login")).toBe("Wake Fix login now");
    expect(threadRowSwipeAccessibilityLabel("snooze", "Fix login")).toBe(
      "Choose when to snooze Fix login",
    );
  });
});

describe("buildSnoozeSwipeMenuItems", () => {
  it("lists the presets with their wake time, then Custom…", () => {
    expect(buildSnoozeSwipeMenuItems(presets)).toEqual([
      { id: "snooze:hour", label: "In 1 hour (10:00)" },
      { id: "snooze:tomorrow", label: "Tomorrow (9:00)" },
      { id: "snooze:custom", label: "Custom…", separatorBefore: true },
    ]);
  });
});

describe("resolveSnoozeSwipeChoice", () => {
  it("maps a pick to its preset", () => {
    expect(resolveSnoozeSwipeChoice("snooze:tomorrow", presets)).toBe(presets[1]);
  });

  it("reports Custom… and ignores dismissals and unknown ids", () => {
    expect(resolveSnoozeSwipeChoice("snooze:custom", presets)).toBe("custom");
    expect(resolveSnoozeSwipeChoice(null, presets)).toBeNull();
    expect(resolveSnoozeSwipeChoice("snooze:next-week", presets)).toBeNull();
  });
});
