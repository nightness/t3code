import type { ReactNode } from "react";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";

export interface PhoneNewTaskSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The thread list's project groups, in its order. */
  readonly projectGroups: ReadonlyArray<SidebarProjectSnapshot>;
  /** Opens the Add project flow. */
  readonly onAddProject: () => void;
}

/**
 * The phone Home's "Choose project" sheet. The web and desktop builds start a thread from the
 * command palette's "New thread in…" picker and render nothing here; the iOS and Android exports
 * resolve ./PhoneNewTaskSheet.mobile.tsx (denext's platform files), apps/mobile's NewTask sheet.
 */
export function PhoneNewTaskSheet(_props: PhoneNewTaskSheetProps): ReactNode {
  return null;
}
