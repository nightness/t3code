import { ClientSettingsSchema, DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  assignThreadToGroup,
  buildThreadGroupMenuItems,
  createThreadGroup,
  DEFAULT_THREAD_GROUP_NAME,
  deleteThreadGroup,
  flattenPartitionedInbox,
  moveThreadGroup,
  nextThreadGroupId,
  normalizeThreadGroupName,
  parseThreadGroupMenuId,
  partitionInboxThreads,
  renameThreadGroup,
  resolveThreadGroupDrop,
  setThreadGroupCollapsed,
  threadGroupIdByKey,
  threadGroupIdOf,
  type ThreadGroup,
} from "./threadGroups.logic";

const decodeClientSettings = Schema.decodeSync(ClientSettingsSchema);

const group = (
  id: string,
  threadKeys: string[],
  extra: Partial<ThreadGroup> = {},
): ThreadGroup => ({
  id,
  name: id.toUpperCase(),
  collapsed: false,
  threadKeys,
  ...extra,
});

describe("thread group settings", () => {
  it("default to off with no groups, so the stock sidebar is unchanged", () => {
    expect(DEFAULT_CLIENT_SETTINGS.sidebarThreadGroupsEnabled).toBe(false);
    expect(DEFAULT_CLIENT_SETTINGS.sidebarThreadGroups).toEqual([]);
  });

  it("decode persisted groups, filling collapsed and members", () => {
    const decoded = decodeClientSettings({
      sidebarThreadGroupsEnabled: true,
      sidebarThreadGroups: [{ id: "g1", name: "Perf" }],
    });
    expect(decoded.sidebarThreadGroups).toEqual([
      { id: "g1", name: "Perf", collapsed: false, threadKeys: [] },
    ]);
  });
});

describe("normalizeThreadGroupName", () => {
  it("trims, collapses whitespace and clips", () => {
    expect(normalizeThreadGroupName("  T3   Code  perf ")).toBe("T3 Code perf");
    expect(normalizeThreadGroupName("   ")).toBeNull();
    expect(normalizeThreadGroupName("x".repeat(80))).toHaveLength(48);
  });
});

describe("group edits", () => {
  it("creates a group and moves the given threads out of other groups", () => {
    const groups = createThreadGroup([group("a", ["e:1", "e:2"])], {
      id: "b",
      name: "  ",
      threadKeys: ["e:2", "e:2"],
    });
    expect(groups).toEqual([
      group("a", ["e:1"]),
      { id: "b", name: DEFAULT_THREAD_GROUP_NAME, collapsed: false, threadKeys: ["e:2"] },
    ]);
  });

  it("renames, but never to an empty name", () => {
    const groups = [group("a", [])];
    expect(renameThreadGroup(groups, "a", " Perf ")[0]?.name).toBe("Perf");
    expect(renameThreadGroup(groups, "a", "  ")[0]?.name).toBe("A");
  });

  it("deletes a group, returning its threads to the inbox", () => {
    const groups = deleteThreadGroup([group("a", ["e:1"]), group("b", [])], "a");
    expect(groups.map((g) => g.id)).toEqual(["b"]);
    expect(threadGroupIdOf(groups, "e:1")).toBeNull();
  });

  it("collapses and reorders", () => {
    const groups = [group("a", []), group("b", []), group("c", [])];
    expect(setThreadGroupCollapsed(groups, "b", true)[1]?.collapsed).toBe(true);
    expect(moveThreadGroup(groups, "a", 2).map((g) => g.id)).toEqual(["b", "c", "a"]);
    expect(moveThreadGroup(groups, "c", -5).map((g) => g.id)).toEqual(["c", "a", "b"]);
    expect(moveThreadGroup(groups, "missing", 0)).toEqual(groups);
  });

  it("assigns a thread to exactly one group, and back to the inbox", () => {
    const groups = [group("a", ["e:1"]), group("b", [])];
    const moved = assignThreadToGroup(groups, "e:1", "b");
    expect(threadGroupIdByKey(moved)).toEqual(new Map([["e:1", "b"]]));
    expect(threadGroupIdOf(assignThreadToGroup(moved, "e:1", null), "e:1")).toBeNull();
  });

  it("returns the same list when nothing changes", () => {
    const groups = [group("a", ["e:1"])];
    expect(assignThreadToGroup(groups, "e:1", "a")).toBe(groups);
    expect(assignThreadToGroup(groups, "e:9", null)).toBe(groups);
    expect(assignThreadToGroup(groups, "e:1", "missing")).toBe(groups);
  });

  it("mints ids that are not taken", () => {
    const values = [0, 0, 0.5];
    const random = () => values.shift() ?? 0.25;
    const first = nextThreadGroupId([], () => 0);
    expect(nextThreadGroupId([group(first, [])], random)).not.toBe(first);
  });
});

describe("partitionInboxThreads", () => {
  const threads = ["e:1", "e:2", "e:3", "e:4"].map((key) => ({ key }));
  const keyOf = (thread: { key: string }) => thread.key;

  it("keeps inbox order inside each section and leaves the rest ungrouped", () => {
    const partition = partitionInboxThreads(threads, keyOf, [
      group("a", ["e:4", "e:2"]),
      group("b", []),
    ]);
    expect(partition.ungrouped.map(keyOf)).toEqual(["e:1", "e:3"]);
    expect(partition.sections.map((s) => [s.group.id, s.threads.map(keyOf)])).toEqual([
      ["a", ["e:2", "e:4"]],
      ["b", []],
    ]);
  });

  it("is the identity when there are no groups", () => {
    const partition = partitionInboxThreads(threads, keyOf, []);
    expect(partition.ungrouped).toBe(threads);
    expect(flattenPartitionedInbox(partition)).toEqual(threads);
  });

  it("flattens to display order, skipping collapsed groups", () => {
    const partition = partitionInboxThreads(threads, keyOf, [
      group("a", ["e:1"], { collapsed: true }),
      group("b", ["e:3"]),
    ]);
    expect(flattenPartitionedInbox(partition).map(keyOf)).toEqual(["e:2", "e:4", "e:3"]);
  });
});

describe("resolveThreadGroupDrop", () => {
  const groups = [group("a", ["e:3"])];
  const inboxKeys = ["e:1", "e:2", "e:3"];

  it("joins the group of the row it lands on", () => {
    expect(resolveThreadGroupDrop({ activeKey: "e:1", overKey: "e:3", inboxKeys, groups })).toBe(
      "a",
    );
    expect(resolveThreadGroupDrop({ activeKey: "e:3", overKey: "e:2", inboxKeys, groups })).toBe(
      null,
    );
  });

  it("leaves membership alone outside the inbox or on itself", () => {
    expect(
      resolveThreadGroupDrop({ activeKey: "e:1", overKey: "e:9", inboxKeys, groups }),
    ).toBeUndefined();
    expect(
      resolveThreadGroupDrop({ activeKey: "e:3", overKey: "e:3", inboxKeys, groups }),
    ).toBeUndefined();
  });
});

describe("thread group menu", () => {
  it("offers the other groups, a new group and removal", () => {
    const [item] = buildThreadGroupMenuItems([group("a", []), group("b", [])], "a");
    expect(item?.children?.map((child) => child.id)).toEqual([
      "thread-group:move:b",
      "thread-group:new",
      "thread-group:remove",
    ]);
    const [ungrouped] = buildThreadGroupMenuItems([], null);
    expect(ungrouped?.children?.map((child) => child.id)).toEqual(["thread-group:new"]);
  });

  it("parses menu ids back into actions", () => {
    expect(parseThreadGroupMenuId("thread-group:move:g-1")).toEqual({
      kind: "move",
      groupId: "g-1",
    });
    expect(parseThreadGroupMenuId("thread-group:new")).toEqual({ kind: "new" });
    expect(parseThreadGroupMenuId("thread-group:remove")).toEqual({ kind: "remove" });
    expect(parseThreadGroupMenuId("thread-group:move:")).toBeNull();
    expect(parseThreadGroupMenuId("pin")).toBeNull();
  });
});
