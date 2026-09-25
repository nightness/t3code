import { ClerkProvider } from "@clerk/electron/react";
import type { ReactNode } from "react";

import { ManagedRelayAuthProvider } from "../../cloud/managedAuth";
import { installCapacitorClerkBridge } from "./capacitorClerkBridge";
import { clerkAppearance } from "./clerkAppearance";

// Before the provider first renders: it reads the transport at render and the token cache on
// every Frontend API request.
installCapacitorClerkBridge();

/**
 * Capacitor half of the managed-auth boundary (see ./capacitorClerkBridge.ts). Like the Electron
 * shell it bundles clerk-js, so it only ever loads lazily, and only inside the native shell.
 * Passkeys stay off: WebAuthn cannot run from the `capacitor://` origin.
 */
export default function CapacitorManagedAuthShell({
  publishableKey,
  children,
}: {
  readonly publishableKey: string;
  readonly children: ReactNode;
}) {
  return (
    <ClerkProvider appearance={clerkAppearance} publishableKey={publishableKey}>
      <ManagedRelayAuthProvider>{children}</ManagedRelayAuthProvider>
    </ClerkProvider>
  );
}
