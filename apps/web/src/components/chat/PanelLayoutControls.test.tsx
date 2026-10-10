import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render, children }: { render: ReactNode; children: ReactNode }) => (
    <>
      {render}
      {children}
    </>
  ),
  TooltipPopup: () => null,
}));

import { PhoneThreadChromeContext } from "../phoneThreadChrome";
import { PanelLayoutControls } from "./PanelLayoutControls";

const noop = () => {};

function render(phoneThread: boolean): string {
  return renderToStaticMarkup(
    <PhoneThreadChromeContext value={phoneThread}>
      <PanelLayoutControls
        terminalAvailable
        terminalOpen={false}
        terminalShortcutLabel={null}
        threadPanelOpen={false}
        threadPanelPresentation="inline"
        threadPanelShortcutLabel={null}
        rightPanelAvailable
        rightPanelOpen={false}
        rightPanelShortcutLabel={null}
        onToggleTerminal={noop}
        onToggleThreadPanel={noop}
        onToggleRightPanel={noop}
      />
    </PhoneThreadChromeContext>,
  );
}

describe("PanelLayoutControls", () => {
  it("offers the right panel outside the phone stack", () => {
    expect(render(false)).toContain('aria-label="Toggle right panel"');
  });

  it("drops the right-panel toggle on a phone thread, as apps/mobile's Thread header has none", () => {
    const html = render(true);
    expect(html).not.toContain('aria-label="Toggle right panel"');
    expect(html).toContain('aria-label="Toggle thread details panel"');
    expect(html).toContain('aria-label="Toggle terminal drawer"');
  });
});
