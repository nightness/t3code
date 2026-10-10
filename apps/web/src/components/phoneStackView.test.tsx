// Runs in the `denext` test project only (it renders denext's real HistoryStack, which the unit
// project cannot resolve; see vite.config.ts).
import type { HistorySource } from "denext/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { phoneStackKey } from "./phoneStack.logic";
import { PhoneStackView } from "./phoneStackView";

const at = (pathname: string): HistorySource => ({
  location: () => ({ pathname, search: "", hash: "", index: 0 }),
  subscribe: () => () => {},
  push: () => {},
  replace: () => {},
  go: () => {},
});

function renderHome(): string {
  // The sidebar layout's row, as AppSidebarLayout's SidebarProvider lays it out.
  return renderToStaticMarkup(
    <div style={{ display: "flex" }}>
      <PhoneStackView
        history={at("/")}
        screens={[
          {
            path: "/",
            render: () => (
              <ul>
                <li data-thread-item="env:thread">Fix login</li>
              </ul>
            ),
          },
        ]}
        getKey={phoneStackKey}
      />
    </div>,
  );
}

describe("PhoneStackView", () => {
  it("shows Home's thread list as the top screen", () => {
    const html = renderHome();
    expect(html).toMatch(/data-dnx-screen-state="top"[^>]*>[\s\S]*data-thread-item="env:thread"/);
    expect(html).not.toMatch(/data-dnx-screen-state="top"[^>]*aria-hidden="true"/);
  });

  it("draws a header's back button as the chevron alone, named by the screen below", () => {
    // The phone Settings stack (settings/phoneSettings.mobile.tsx) at a section: the list is
    // stacked under it, and the section's header goes back to it.
    const html = renderToStaticMarkup(
      <PhoneStackView
        history={at("/settings/general")}
        base="/settings"
        screens={[
          { path: "/settings", render: () => <p>list</p>, options: { title: "Settings" } },
          {
            path: "/settings/$section",
            render: () => <p>general</p>,
            options: { title: "General", headerShown: true },
          },
        ]}
      />,
    );
    const back = html.match(/<(a|button)\b[^>]*data-dnx-back[^>]*>[\s\S]*?<\/\1>/)?.[0] ?? "";
    expect(back).toMatch(/aria-label="Settings"/);
    expect(back).not.toMatch(/>Settings</);
    expect(back).not.toMatch(/>Back</);
  });

  it("fills the layout row, so its absolutely positioned screens get a width", () => {
    const stack = renderHome().match(/<div[^>]*data-dnx-stack[^>]*>/)?.[0] ?? "";
    expect(stack).toMatch(/flex:\s*1 1 0%/);
    expect(stack).toMatch(/width:\s*100%/);
    expect(stack).toMatch(/min-width:\s*0/);
  });
});
