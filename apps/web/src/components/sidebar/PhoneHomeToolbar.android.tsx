// The Android export's variant of ./PhoneHomeToolbar.tsx (denext's platform files): apps/mobile's
// Android Home (features/home/MaterialThreadListToolbar.tsx, AndroidHomeFab.android.tsx). Search
// opens from the top toolbar's search button ("Search threads") and takes the toolbar's place,
// with a back arrow ("Close search") to leave it; New thread is an extended floating action
// button at the bottom trailing corner (MaterialNewThreadButton: "square.and.pencil" + "New
// thread"), with the filter's floating action button 8 px above it ("Filter threads"). Add
// project is not on the phone Home: apps/mobile adds a project from the new-task sheet.
import { ArrowLeftIcon, SearchIcon, SquarePenIcon, XIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "../ui/button";
import type { PhoneHomeToolbarProps } from "./PhoneHomeToolbar";

export type { PhoneHomeToolbarProps } from "./PhoneHomeToolbar";

/** A Material 3 floating action button's surface (16 dp corners, level-3 shadow). */
const FAB = "pointer-events-auto rounded-2xl shadow-lg";

export function PhoneHomeToolbar(props: PhoneHomeToolbarProps): ReactNode {
  const { searchOpen, searchInputRef } = props;
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen, searchInputRef]);
  const closeSearch = () => {
    props.onClearSearch();
    props.onSearchOpenChange(false);
  };
  return (
    <>
      {searchOpen ? (
        // In the toolbar's place, over the header (its 52 px row under the status bar).
        <div
          data-phone-home-search=""
          className="fixed inset-x-0 top-0 z-30 flex items-end bg-background px-2 pt-safe"
          style={{ height: "calc(var(--workspace-topbar-height) + env(safe-area-inset-top, 0px))" }}
        >
          <div className="flex h-(--workspace-topbar-height) w-full items-center gap-1">
            <Button aria-label="Close search" size="icon" variant="ghost" onClick={closeSearch}>
              <ArrowLeftIcon className="size-5" />
            </Button>
            <input
              ref={searchInputRef}
              type="search"
              value={props.searchQuery}
              onChange={(event) => props.onSearchQueryChange(event.currentTarget.value)}
              onKeyDown={props.onSearchKeyDown}
              placeholder="Search"
              aria-label="Search threads"
              className="h-12 min-w-0 flex-1 rounded-full bg-accent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {props.searchQuery !== "" ? (
              <Button
                aria-label="Clear search"
                size="icon"
                variant="ghost"
                onClick={props.onClearSearch}
              >
                <XIcon className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        data-phone-home-toolbar=""
        className="pointer-events-none fixed right-5 bottom-0 z-20 flex flex-col items-end gap-2 pb-safe"
      >
        {props.hasProjects ? (
          <div
            aria-label="Filter threads"
            className={`${FAB} flex size-14 items-center justify-center border border-border bg-card text-foreground`}
          >
            {props.projectScope}
          </div>
        ) : null}
        <button
          type="button"
          aria-label="New thread"
          disabled={props.newThreadDisabled}
          className={`${FAB} mb-4 flex h-14 items-center gap-3 bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-50`}
          onClick={props.onNewThread}
        >
          <SquarePenIcon className="size-5" />
          New thread
        </button>
      </div>
    </>
  );
}

/** apps/mobile's Android toolbar search button ("magnifyingglass", "Search threads"). */
export function PhoneHomeSearchButton(props: { readonly onPress: () => void }): ReactNode {
  return (
    <Button aria-label="Search threads" size="icon" variant="ghost" onClick={props.onPress}>
      <SearchIcon className="size-4" />
    </Button>
  );
}
