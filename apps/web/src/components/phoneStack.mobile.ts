// The iOS and Android exports' variant of ./phoneStack.ts (denext's platform files).
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSidebar } from "./ui/sidebar";

/**
 * Whether the phone stack owns the screen: a phone-sized window (the drawer breakpoint) on a
 * `_chat` route. A wider window (an iPad) keeps the split layout, as apps/mobile does.
 */
function usePhoneStackActive(): boolean {
  const { isMobile } = useSidebar();
  const onChatRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/_chat"),
  });
  return isMobile && onChatRoute;
}

/** The drawer and its toggle, except where the stack's Home screen shows the thread list. */
export function HiddenUnderPhoneStack(props: { readonly children: ReactNode }): ReactNode {
  return usePhoneStackActive() ? null : props.children;
}
