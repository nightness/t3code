import {
  buildSidebarProjectPickerEntries,
  type SidebarProjectPickerEntry,
  type SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";

/**
 * The phone "Choose project" sheet's rows (PhoneNewTaskSheet.mobile.tsx): every project group in
 * the thread list's order, without the scratch ("No project") home, which has its own card, and
 * narrowed by the search to groups whose name or any member's workspace contains the query, as
 * apps/mobile's NewTaskRouteScreen filters its scopes.
 */
export function phoneNewTaskEntries(input: {
  readonly groups: ReadonlyArray<SidebarProjectSnapshot>;
  readonly query: string;
  readonly isScratch: (project: SidebarProjectPickerEntry["targetProject"]) => boolean;
}): SidebarProjectPickerEntry[] {
  const needle = input.query.trim().toLowerCase();
  return buildSidebarProjectPickerEntries({
    groups: input.groups,
    preferredProjectRef: null,
  }).filter(
    ({ group, targetProject }) =>
      !input.isScratch(targetProject) &&
      (needle === "" ||
        group.displayName.toLowerCase().includes(needle) ||
        group.memberProjects.some((member) => member.workspaceRoot.toLowerCase().includes(needle))),
  );
}
