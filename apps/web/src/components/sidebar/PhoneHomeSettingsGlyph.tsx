// The phone Home header's settings glyph. apps/mobile's Android Home toolbar opens Settings from
// a gear ("gearshape", features/home/MaterialThreadListToolbar.tsx); the iOS export resolves
// ./PhoneHomeSettingsGlyph.ios.tsx (denext's platform files) for the iPhone's ellipsis.
import { SettingsIcon } from "lucide-react";
import type { ReactNode } from "react";

export function PhoneHomeSettingsGlyph(): ReactNode {
  return <SettingsIcon />;
}
