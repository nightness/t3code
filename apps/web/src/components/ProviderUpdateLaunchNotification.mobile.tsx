// The iOS and Android exports' variant of ./ProviderUpdateLaunchNotification.tsx (denext's platform
// files). apps/mobile raises no provider-update prompt at launch: a provider's update status and
// its Update action live on the environment's Settings screen
// (features/settings/SettingsEnvironmentDetailRouteScreen.tsx), which the phone build's Settings ->
// Providers mirrors. So the phone exports mount nothing here; web and desktop keep the toast.
import type { ReactNode } from "react";

export function ProviderUpdateLaunchNotification(): ReactNode {
  return null;
}
