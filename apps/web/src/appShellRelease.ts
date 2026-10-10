import { shellReady } from "denext/client";
import { useEffect } from "react";

import { resolveAppShellMode } from "./appShellBoot.logic";
import { IS_PHONE_EXPORT } from "./denext/phoneExport";

/**
 * Whether the app may replace the prerendered shell (AppShell.static.tsx) on its first render at
 * `pathname`. The shell otherwise holds until the composer editor has taken what was typed
 * (components/composerShellHandoff.ts). Where the shell is the logo splash (the routes it has no
 * layout for, and every route on the phone exports) it goes as soon as the app renders, as the
 * splash always did.
 */
export function releasesAppShellAt(pathname: string): boolean {
  return IS_PHONE_EXPORT || resolveAppShellMode(pathname) === "splash";
}

/**
 * Release the prerendered shell once `release` holds: for a screen that takes over from the
 * shell's composer without a composer of its own (onboarding, an error state). Inert on a page
 * without a shell.
 */
export function useReleaseAppShell(release: boolean): void {
  useEffect(() => {
    if (release) void shellReady();
  }, [release]);
}
