import type { ReactNode } from "react";

/**
 * The app chrome that the phone stack replaces: the thread drawer and its toggle. The web and
 * desktop builds always render it; the iOS and Android exports resolve ./phoneStack.mobile.ts
 * (denext's platform files), where a phone-sized window on a `_chat` route shows the thread list
 * as the stack's Home screen instead (components/ChatRouteContent.mobile.tsx).
 */
export function HiddenUnderPhoneStack(props: { readonly children: ReactNode }): ReactNode {
  return props.children;
}
