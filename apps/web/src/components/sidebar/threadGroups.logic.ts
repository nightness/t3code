import type { ContextMenuItem } from "@t3tools/contracts";
import type { SidebarThreadGroup } from "@t3tools/contracts/settings";

/**
 * User-defined thread groups (sidebar beta, overhaul F3). Pure functions over
 * the persisted list in client settings (`sidebarThreadGroups`), so the
 * sidebar, its context menu and the tests share one model.
 *
 * Rules:
 * - a thread belongs to at most one group;
 * - groups only partition the inbox (the "active" section): pinned, working,
 *   snoozed and settled threads stay on their lifecycle shelves and keep their
 *   membership for when they return;
 * - order inside a group is the inbox's own order (manual keys or time), so
 *   grouping never fights the server's ordering.
 */
export type ThreadGroup = SidebarThreadGroup;

export const MAX_THREAD_GROUP_NAME_LENGTH = 48;
export const DEFAULT_THREAD_GROUP_NAME = "New group";

/** Trim, collapse whitespace and clip a group name; null when nothing is left. */
export function normalizeThreadGroupName(name: string): string | null {
  const normalized = name.replace(/\s+/g, " ").trim().slice(0, MAX_THREAD_GROUP_NAME_LENGTH).trim();
  return normalized.length > 0 ? normalized : null;
}

/** A group id that is not taken yet. */
export function nextThreadGroupId(
  groups: readonly ThreadGroup[],
  random: () => number = Math.random,
): string {
  const taken = new Set(groups.map((group) => group.id));
  for (;;) {
    const id = `group-${Math.floor(random() * 0x100000000)
      .toString(36)
      .padStart(7, "0")}`;
    if (!taken.has(id)) return id;
  }
}

function withoutThread(group: ThreadGroup, threadKey: string): ThreadGroup {
  return group.threadKeys.includes(threadKey)
    ? { ...group, threadKeys: group.threadKeys.filter((key) => key !== threadKey) }
    : group;
}

/** Add a group at the end; the given threads move into it from any other group. */
export function createThreadGroup(
  groups: readonly ThreadGroup[],
  input: { readonly id: string; readonly name: string; readonly threadKeys?: readonly string[] },
): ThreadGroup[] {
  const name = normalizeThreadGroupName(input.name) ?? DEFAULT_THREAD_GROUP_NAME;
  const threadKeys = [...new Set(input.threadKeys ?? [])];
  const moved = new Set(threadKeys);
  return [
    ...groups.map((group) =>
      group.threadKeys.some((key) => moved.has(key))
        ? { ...group, threadKeys: group.threadKeys.filter((key) => !moved.has(key)) }
        : group,
    ),
    { id: input.id, name, collapsed: false, threadKeys },
  ];
}

/** Rename a group. An empty name keeps the old one. */
export function renameThreadGroup(
  groups: readonly ThreadGroup[],
  groupId: string,
  name: string,
): ThreadGroup[] {
  const normalized = normalizeThreadGroupName(name);
  return groups.map((group) =>
    group.id === groupId && normalized !== null && normalized !== group.name
      ? { ...group, name: normalized }
      : group,
  );
}

/** Remove a group; its threads return to the inbox. */
export function deleteThreadGroup(groups: readonly ThreadGroup[], groupId: string): ThreadGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

export function setThreadGroupCollapsed(
  groups: readonly ThreadGroup[],
  groupId: string,
  collapsed: boolean,
): ThreadGroup[] {
  return groups.map((group) =>
    group.id === groupId && group.collapsed !== collapsed ? { ...group, collapsed } : group,
  );
}

/** Move a group to `toIndex` (splice semantics), clamped to the list. */
export function moveThreadGroup(
  groups: readonly ThreadGroup[],
  groupId: string,
  toIndex: number,
): ThreadGroup[] {
  const from = groups.findIndex((group) => group.id === groupId);
  if (from === -1) return [...groups];
  const next = [...groups];
  const [moved] = next.splice(from, 1);
  const to = Math.max(0, Math.min(next.length, toIndex));
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Put a thread in `groupId` (appended), or back in the inbox with null.
 * Returns the same array when nothing changes, so callers can skip a write.
 */
export function assignThreadToGroup(
  groups: readonly ThreadGroup[],
  threadKey: string,
  groupId: string | null,
): readonly ThreadGroup[] {
  const current = threadGroupIdOf(groups, threadKey);
  if (current === groupId) return groups;
  if (groupId !== null && !groups.some((group) => group.id === groupId)) return groups;
  return groups.map((group) => {
    const cleared = withoutThread(group, threadKey);
    return group.id === groupId
      ? { ...cleared, threadKeys: [...cleared.threadKeys, threadKey] }
      : cleared;
  });
}

export function threadGroupIdOf(groups: readonly ThreadGroup[], threadKey: string): string | null {
  for (const group of groups) {
    if (group.threadKeys.includes(threadKey)) return group.id;
  }
  return null;
}

export function threadGroupIdByKey(groups: readonly ThreadGroup[]): Map<string, string> {
  const byKey = new Map<string, string>();
  for (const group of groups) {
    for (const key of group.threadKeys) {
      if (!byKey.has(key)) byKey.set(key, group.id);
    }
  }
  return byKey;
}

export interface ThreadGroupSection<T> {
  readonly group: ThreadGroup;
  /** Every member in inbox order, collapsed or not. */
  readonly threads: readonly T[];
}

export interface PartitionedInbox<T> {
  readonly ungrouped: readonly T[];
  readonly sections: readonly ThreadGroupSection<T>[];
}

/** Split inbox threads into the ungrouped run and one section per group, keeping inbox order. */
export function partitionInboxThreads<T>(
  threads: readonly T[],
  keyOf: (thread: T) => string,
  groups: readonly ThreadGroup[],
): PartitionedInbox<T> {
  if (groups.length === 0) return { ungrouped: threads, sections: [] };
  const groupOf = threadGroupIdByKey(groups);
  const members = new Map<string, T[]>(groups.map((group) => [group.id, []]));
  const ungrouped: T[] = [];
  for (const thread of threads) {
    const groupId = groupOf.get(keyOf(thread));
    const bucket = groupId === undefined ? undefined : members.get(groupId);
    if (bucket) bucket.push(thread);
    else ungrouped.push(thread);
  }
  return {
    ungrouped,
    sections: groups.map((group) => ({ group, threads: members.get(group.id) ?? [] })),
  };
}

/**
 * The inbox in display order: ungrouped threads, then each group's members
 * (none for a collapsed group).
 */
export function flattenPartitionedInbox<T>(partition: PartitionedInbox<T>): T[] {
  const rows = [...partition.ungrouped];
  for (const section of partition.sections) {
    if (!section.group.collapsed) rows.push(...section.threads);
  }
  return rows;
}

/**
 * The group a dragged inbox row joins: the group of the row it was dropped on.
 * `undefined` means "leave membership alone" (the drop landed outside the
 * inbox, or on itself); `null` means the ungrouped inbox.
 */
export function resolveThreadGroupDrop(input: {
  readonly activeKey: string;
  readonly overKey: string;
  /** Keys of the inbox rows as displayed, before the drop. */
  readonly inboxKeys: readonly string[];
  readonly groups: readonly ThreadGroup[];
}): string | null | undefined {
  if (input.activeKey === input.overKey) return undefined;
  if (!input.inboxKeys.includes(input.overKey)) return undefined;
  return threadGroupIdOf(input.groups, input.overKey);
}

export type ThreadGroupMenuId =
  | "thread-group:new"
  | "thread-group:remove"
  | `thread-group:move:${string}`;

/** "Move to group" items appended to a thread's context menu. */
export function buildThreadGroupMenuItems(
  groups: readonly ThreadGroup[],
  currentGroupId: string | null,
): ReadonlyArray<ContextMenuItem<ThreadGroupMenuId>> {
  const destinations = groups
    .filter((group) => group.id !== currentGroupId)
    .map((group) => ({ id: `thread-group:move:${group.id}` as const, label: group.name }));
  return [
    {
      id: "thread-group:move:" as const,
      label: "Move to group",
      icon: "folder",
      separatorBefore: true,
      children: [
        ...destinations,
        {
          id: "thread-group:new" as const,
          label: "New group…",
          separatorBefore: destinations.length > 0,
        },
        ...(currentGroupId === null
          ? []
          : [{ id: "thread-group:remove" as const, label: "Remove from group" }]),
      ],
    },
  ];
}

export function isThreadGroupMenuId(id: string): id is ThreadGroupMenuId {
  return id.startsWith("thread-group:");
}

/** Insert the group items into a thread menu, just above its archive/delete block. */
export function withThreadGroupMenuItems<T extends string>(
  items: ReadonlyArray<ContextMenuItem<T>>,
  groupItems: ReadonlyArray<ContextMenuItem<ThreadGroupMenuId>>,
): Array<ContextMenuItem<T | ThreadGroupMenuId>> {
  const merged: Array<ContextMenuItem<T | ThreadGroupMenuId>> = [...items];
  if (groupItems.length === 0) return merged;
  const archiveIndex = items.findIndex((item) => item.id === "archive");
  merged.splice(archiveIndex === -1 ? merged.length : archiveIndex, 0, ...groupItems);
  return merged;
}

export type ThreadGroupMenuAction =
  | { readonly kind: "new" }
  | { readonly kind: "remove" }
  | { readonly kind: "move"; readonly groupId: string };

export function parseThreadGroupMenuId(id: string): ThreadGroupMenuAction | null {
  if (id === "thread-group:new") return { kind: "new" };
  if (id === "thread-group:remove") return { kind: "remove" };
  if (id.startsWith("thread-group:move:") && id.length > "thread-group:move:".length) {
    return { kind: "move", groupId: id.slice("thread-group:move:".length) };
  }
  return null;
}
