// The iOS export's variant of ./PhoneHomeToolbar.tsx (denext's platform files): apps/mobile's
// iPhone Home on iOS 26 (features/home/HomeHeader.tsx: createNativeMailSearchToolbarItem), the
// thread list's search, filter and compose in one floating bottom toolbar, as Mail's: the filter
// at the leading edge, the search field between, compose ("square.and.pencil") at the trailing
// edge. Each is a glass control 44 px high over the list, which leaves room beneath its last row
// (NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET, phone-parity.css). Add project is not on the
// phone Home: apps/mobile adds a project from the new-task sheet (PhoneNewTaskSheet).
import { SearchIcon, SquarePenIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { PhoneHomeToolbarProps } from "./PhoneHomeToolbar";

export type { PhoneHomeToolbarProps } from "./PhoneHomeToolbar";

/** A Liquid Glass control's surface: translucent, blurred, hairline-edged. */
const GLASS =
  "pointer-events-auto border border-border/60 bg-background/90 shadow-lg backdrop-blur-xl";

export function PhoneHomeToolbar({
  projectScope,
  hasProjects,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  onClearSearch,
  onNewThread,
  newThreadDisabled,
}: PhoneHomeToolbarProps): ReactNode {
  return (
    <div
      data-phone-home-toolbar=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 px-4 pb-safe"
    >
      {hasProjects ? (
        <div
          className={`${GLASS} mb-2 flex size-11 shrink-0 items-center justify-center rounded-full`}
        >
          {projectScope}
        </div>
      ) : null}
      <label
        className={`${GLASS} mb-2 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-muted-foreground`}
      >
        <SearchIcon aria-hidden className="size-4 shrink-0" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search"
          aria-label="Search threads"
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery !== "" ? (
          <button
            type="button"
            aria-label="Clear thread search"
            className="shrink-0 rounded-full p-1"
            onClick={onClearSearch}
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </label>
      <button
        type="button"
        aria-label="New thread"
        disabled={newThreadDisabled}
        className={`${GLASS} mb-2 flex size-11 shrink-0 items-center justify-center rounded-full text-foreground disabled:opacity-50`}
        onClick={onNewThread}
      >
        <SquarePenIcon className="size-5" />
      </button>
    </div>
  );
}

export function PhoneHomeSearchButton(_props: { readonly onPress: () => void }): ReactNode {
  return null;
}
