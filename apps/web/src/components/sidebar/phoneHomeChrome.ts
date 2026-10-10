import { createContext, use } from "react";

/**
 * True inside the phone stack's Home screen (components/ChatRouteContent.mobile.tsx), where the
 * thread list is a full screen rather than a drawer. Its header then follows apps/mobile's Home
 * header (the brand title, settings at the trailing edge) instead of carrying the drawer toggle,
 * which has no drawer to open there. The web and desktop builds never provide it.
 */
export const PhoneHomeChromeContext = createContext(false);

export function usePhoneHomeChrome(): boolean {
  return use(PhoneHomeChromeContext);
}
