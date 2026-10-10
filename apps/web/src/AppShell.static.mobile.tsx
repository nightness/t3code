/**
 * The iOS and Android exports' prerendered shell (denext's platform files): the boot splash
 * these exports have always shown. Their first screen is apps/mobile's Home, which takes no
 * typing, so there is nothing to carry over; routes/__root.tsx releases the shell as soon as the
 * app has rendered, exactly when the splash used to be replaced.
 */
import { BootSplash } from "./AppShell.splash";

export default function AppShell() {
  return <BootSplash />;
}
