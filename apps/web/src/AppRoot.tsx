import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { PreviewAutomationHosts } from "./components/preview/PreviewAutomationHosts";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { UiUpdateDialogHost } from "./components/UiUpdateDialogHost";
import { useNativeDeepLinks, useNativePushTaps } from "./deepLinks";
import { onUiFirstRender } from "./ota";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

/**
 * Owns renderer-wide providers. The Electron browser host intentionally sits
 * outside the router so its webviews survive route transitions, but it must
 * share the same atom registry as routed UI.
 */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  // The first commit proves this UI build boots. The native shell uses that to keep an
  // over-the-air UI on its trial launch instead of rolling it back (./ota.ts).
  useEffect(() => {
    onUiFirstRender();
  }, []);
  // `t3code://` links and notification taps in the native shell (./deepLinks.ts).
  useNativeDeepLinks(router);
  useNativePushTaps(router);

  return (
    <AppAtomRegistryProvider>
      <RouterProvider router={router} />
      <PreviewAutomationHosts />
      <ElectronBrowserHost />
      <QuitHoldOverlay />
      <UiUpdateDialogHost />
    </AppAtomRegistryProvider>
  );
}
