// The phone stack's view (components/ChatRouteContent.mobile.tsx binds it to TanStack Router).
// Only the phone variant imports it, so the web build never carries denext/navigation.
import { HistoryStack, type HistoryScreen, type HistorySource } from "denext/navigation";
import type { ReactNode } from "react";

// T3 draws its own headers (the thread header, the list's chrome): the stack adds none.
const SCREEN_OPTIONS = { headerShown: false } as const;

/**
 * The stack is a flex item of the sidebar layout's row, and its screens are absolutely
 * positioned, so it has no width of its own: it must fill the row, or every screen is 0 px wide
 * (a blank Home). Screens paint T3's background, not the platform theme's.
 */
export const PHONE_STACK_STYLE = {
  flex: "1 1 0%",
  minWidth: 0,
  width: "100%",
  "--dnx-screen-bg": "var(--background)",
} as const;

export function PhoneStackView(props: {
  readonly history: HistorySource;
  readonly screens: readonly HistoryScreen[];
  readonly getKey: (href: string) => string;
}): ReactNode {
  return (
    <HistoryStack
      history={props.history}
      screens={props.screens}
      getKey={props.getKey}
      screenOptions={SCREEN_OPTIONS}
      style={PHONE_STACK_STYLE}
    />
  );
}
