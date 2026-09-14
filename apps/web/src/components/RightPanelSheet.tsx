import { type ReactNode } from "react";

import { RIGHT_PANEL_SHEET_CLASS_NAME } from "../rightPanelLayout";
import { Sheet, SheetPopup } from "./ui/sheet";

export function RightPanelSheet(props: {
  animationDurationMs: number;
  children: ReactNode;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <SheetPopup
        transitionDurationMs={props.animationDurationMs}
        side="right"
        showCloseButton={false}
        keepMounted
        className={RIGHT_PANEL_SHEET_CLASS_NAME}
      >
        {/* The sheet overlays the full viewport, so on an edge-to-edge phone
            (the Capacitor iOS shell) its tab bar would sit under the status
            bar and its content under the home indicator. Browsers and desktop
            resolve these insets to 0. The panel background fills the inset
            strips so they match the panel instead of the popover surface. */}
        <div className="flex h-full min-h-0 w-full flex-col bg-background pt-safe pr-safe pb-safe">
          {props.children}
        </div>
      </SheetPopup>
    </Sheet>
  );
}
