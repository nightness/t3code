import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";

/** What the phone Home's search / filter / compose controls drive (the thread list's state). */
export interface PhoneHomeToolbarProps {
  /** The project filter: the thread list's scope combobox, its trigger a 28 px icon button. */
  readonly projectScope: ReactNode;
  readonly hasProjects: boolean;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  readonly searchQuery: string;
  readonly onSearchQueryChange: (value: string) => void;
  readonly onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  readonly onClearSearch: () => void;
  /** Android: whether the toolbar's search field is open (it replaces the header's title). */
  readonly searchOpen: boolean;
  readonly onSearchOpenChange: (open: boolean) => void;
  readonly onNewThread: (event: ReactMouseEvent) => void;
  readonly newThreadDisabled: boolean;
}

/**
 * The phone Home's search, project filter and new-thread controls, where apps/mobile puts them.
 * The web and desktop builds keep them in the thread list's header row (SidebarThreadHeader) and
 * render nothing here. The iOS export resolves ./PhoneHomeToolbar.ios.tsx (the iOS 26 bottom
 * toolbar: filter, search, compose); the Android export ./PhoneHomeToolbar.android.tsx (search
 * in the top toolbar, the filter and New thread as floating action buttons).
 */
export function PhoneHomeToolbar(_props: PhoneHomeToolbarProps): ReactNode {
  return null;
}

/** The header's search button, where a platform opens search from the top toolbar. */
export function PhoneHomeSearchButton(_props: { readonly onPress: () => void }): ReactNode {
  return null;
}
