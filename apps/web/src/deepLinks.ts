import { useDeepLink } from "denext/mobile";

import { isNativeShell } from "./nativeShell";
import type { AppRouter } from "./router";

/**
 * `t3code://` links in the Capacitor shell (apps/capacitor/README.md). denext does the work
 * (`useDeepLink` from `denext/mobile`, over `@capacitor/app`); this module only maps the one link
 * the React Native app answers in production onto the web UI's routes:
 * `t3code://threads/<environmentId>/<threadId>` opens that thread (`/<environmentId>/<threadId>`).
 *
 * Pairing links (`t3code://pair?pairingUrl=…`) are deliberately ignored: the hosted pairing
 * route submits its token on load, so a link any app or page can craft would pair an
 * environment without a tap, and the React Native app ignores them in production too. Pairing
 * stays in the connection form (paste or QR scan). Any other link is ignored as well.
 */

const DEEP_LINK_SCHEME = "t3code";

/** Where `denext/mobile` parses nothing but the path, query and hash. */
const PATH_BASE = "https://t3code.invalid";

function decodeSegment(segment: string | undefined): string | null {
  if (segment === undefined) return null;
  try {
    const decoded = decodeURIComponent(segment);
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * The web UI href a deep link's in-app path opens, or null to ignore it. `path` is what
 * `denext/mobile` derives from the link: `t3code://threads/env/thread` → `/threads/env/thread`.
 */
export function deepLinkHref(path: string): string | null {
  let url: URL;
  try {
    url = new URL(path, PATH_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PATH_BASE) return null;
  const segments = url.pathname.split("/");
  if (segments.length === 4 && segments[1] === "threads") {
    const environmentId = decodeSegment(segments[2]);
    const threadId = decodeSegment(segments[3]);
    if (environmentId === null || threadId === null) return null;
    return `/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
  }
  return null;
}

/**
 * Follows `t3code://` links while the app runs and the one that launched it. Browsers and
 * desktop never get past the `isNativeShell()` gate (denext itself does nothing there either).
 */
export function useNativeDeepLinks(router: AppRouter): void {
  useDeepLink(() => {}, {
    accept: (url) => isNativeShell() && url.protocol === `${DEEP_LINK_SCHEME}:`,
    route: (path) => {
      const href = deepLinkHref(path);
      if (href !== null) void router.navigate({ href });
    },
  });
}
