// The iOS and Android exports' variant of ./phoneStack.ts (denext's platform files).
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSidebar } from "./ui/sidebar";

/**
 * Whether a phone stack owns the screen: a phone-sized window (the drawer breakpoint) on a
 * `_chat` route (the Home → Thread stack) or on Settings (its own list → detail stack,
 * components/settings/phoneSettings.mobile.tsx). A wider window (an iPad) keeps the split
 * layout, as apps/mobile does.
 */
function usePhoneStackActive(): boolean {
  const { isMobile } = useSidebar();
  const onStackRoute = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/_chat" || match.routeId === "/settings"),
  });
  return isMobile && onStackRoute;
}

/** The drawer and its toggle, except where the stack's Home screen shows the thread list. */
export function HiddenUnderPhoneStack(props: { readonly children: ReactNode }): ReactNode {
  return usePhoneStackActive() ? null : props.children;
}
