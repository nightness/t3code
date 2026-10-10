import type { ReactNode } from "react";

/**
 * Settings on a phone. The web and desktop builds always use the settings layout's sidebar nav
 * and page header; the iOS and Android exports resolve ./phoneSettings.mobile.tsx (denext's
 * platform files), where a phone-sized window shows Settings as apps/mobile does: a list of the
 * sections, each pushing its page, with a close button back to the app.
 */
export function usePhoneSettings(): boolean {
  return false;
}

/** Whether `/settings` itself redirects to its first section (it does outside the phone). */
export function shouldRedirectSettingsIndex(): boolean {
  return true;
}

export interface PhoneSettingsLayoutProps {
  /** A section's page: the scope boundary around the route's outlet. */
  readonly page: ReactNode;
  /** The trailing header control of the General page (restore device defaults). */
  readonly generalAction: ReactNode;
}

export function PhoneSettingsLayout(_props: PhoneSettingsLayoutProps): ReactNode {
  return null;
}
