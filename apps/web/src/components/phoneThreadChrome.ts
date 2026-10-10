import { createContext, use } from "react";

/**
 * True inside a thread pushed on the phone stack (components/ChatRouteContent.mobile.tsx). Its
 * header follows apps/mobile's Thread header, which has no right-panel toggle: the phone has no
 * room for a side panel, and apps/mobile opens files, review and the terminal as their own
 * screens and sheets. The web and desktop builds, and an iPad's split layout, never provide it.
 */
export const PhoneThreadChromeContext = createContext(false);

export function usePhoneThreadChrome(): boolean {
  return use(PhoneThreadChromeContext);
}
