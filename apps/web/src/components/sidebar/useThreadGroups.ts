import { useCallback, useMemo } from "react";

import { persistClientSettingsUpdate, useClientSettings } from "~/hooks/useSettings";
import {
  assignThreadToGroup,
  createThreadGroup,
  deleteThreadGroup,
  moveThreadGroup,
  nextThreadGroupId,
  renameThreadGroup,
  setThreadGroupCollapsed,
  type ThreadGroup,
} from "./threadGroups.logic";

const NO_THREAD_GROUPS: readonly ThreadGroup[] = [];

/**
 * Thread groups (sidebar beta), persisted in client settings: localStorage in
 * the browser and the shell's settings store on desktop and phones. A
 * server-side version would move `sidebarThreadGroups` into the shared
 * settings sync so every device sees the same groups.
 */
export function useThreadGroups(): {
  readonly enabled: boolean;
  /** The groups to render: empty while the beta is off. */
  readonly groups: readonly ThreadGroup[];
} {
  const enabled = useClientSettings(selectThreadGroupsEnabled);
  const groups = useClientSettings(selectThreadGroups);
  return { enabled, groups: enabled ? groups : NO_THREAD_GROUPS };
}

function selectThreadGroupsEnabled(settings: { sidebarThreadGroupsEnabled: boolean }) {
  return settings.sidebarThreadGroupsEnabled;
}

function selectThreadGroups(settings: { sidebarThreadGroups: readonly ThreadGroup[] }) {
  return settings.sidebarThreadGroups;
}

function updateThreadGroups(
  update: (groups: readonly ThreadGroup[]) => readonly ThreadGroup[],
): Promise<unknown> {
  return persistClientSettingsUpdate((settings) => {
    const next = update(settings.sidebarThreadGroups);
    return next === settings.sidebarThreadGroups
      ? settings
      : { ...settings, sidebarThreadGroups: [...next] };
  });
}

export interface ThreadGroupActions {
  /** Create a group holding `threadKeys`; resolves to its id. */
  readonly create: (name: string, threadKeys?: readonly string[]) => Promise<string>;
  readonly rename: (groupId: string, name: string) => void;
  readonly remove: (groupId: string) => void;
  readonly toggleCollapsed: (groupId: string) => void;
  readonly move: (groupId: string, toIndex: number) => void;
  readonly assign: (threadKey: string, groupId: string | null) => void;
}

export function useThreadGroupActions(): ThreadGroupActions {
  const create = useCallback(async (name: string, threadKeys: readonly string[] = []) => {
    let id = "";
    await updateThreadGroups((groups) => {
      id = nextThreadGroupId(groups);
      return createThreadGroup(groups, { id, name, threadKeys });
    });
    return id;
  }, []);
  const rename = useCallback((groupId: string, name: string) => {
    void updateThreadGroups((groups) => renameThreadGroup(groups, groupId, name));
  }, []);
  const remove = useCallback((groupId: string) => {
    void updateThreadGroups((groups) => deleteThreadGroup(groups, groupId));
  }, []);
  const toggleCollapsed = useCallback((groupId: string) => {
    void updateThreadGroups((groups) => {
      const group = groups.find((candidate) => candidate.id === groupId);
      return group ? setThreadGroupCollapsed(groups, groupId, !group.collapsed) : groups;
    });
  }, []);
  const move = useCallback((groupId: string, toIndex: number) => {
    void updateThreadGroups((groups) => moveThreadGroup(groups, groupId, toIndex));
  }, []);
  const assign = useCallback((threadKey: string, groupId: string | null) => {
    void updateThreadGroups((groups) => assignThreadToGroup(groups, threadKey, groupId));
  }, []);
  return useMemo(
    () => ({ create, rename, remove, toggleCollapsed, move, assign }),
    [assign, create, move, remove, rename, toggleCollapsed],
  );
}
