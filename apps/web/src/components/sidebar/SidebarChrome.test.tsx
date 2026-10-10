import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
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
// The sidebar primitives need the layout's provider; the chrome's choices are what is tested.
vi.mock("../ui/sidebar", () => ({
  SidebarFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, ...props }: ComponentProps<"button">) => (
    <button {...props}>{children}</button>
  ),
  SidebarTrigger: () => <button data-sidebar="trigger">Toggle Sidebar</button>,
  useSidebar: () => ({ isMobile: true, setOpenMobile: () => {} }),
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => "artwork",
}));
vi.mock("../SidebarStageBackdrop", () => ({
  resolveEnvironmentIdentificationPillLabel: () => null,
  resolveSidebarStageBackdropVariant: () => null,
  SidebarStageBackdrop: () => null,
  useEnvironmentStageLabel: () => "Alpha",
}));
vi.mock("../../state/environments", () => ({ usePullRequestsSupported: () => true }));
vi.mock("./SidebarUpdatePill", () => ({
  SidebarUpdatePill: () => null,
  SidebarUpdateArchitectureWarning: () => null,
}));

import { PhoneHomeChromeContext } from "./phoneHomeChrome";
import { SidebarChromeHeader, SidebarUtilityMenu } from "./SidebarChrome";

async function renderChrome(phoneHome: boolean): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <PhoneHomeChromeContext value={phoneHome}>
          <SidebarChromeHeader isElectron={false} />
          <SidebarUtilityMenu />
        </PhoneHomeChromeContext>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;
const DRAWER_TOGGLE = /data-sidebar="trigger"/g;
const button = (label: string) => new RegExp(`<button[^>]*aria-label="${label}"`, "g");
/** The brand link's class list. */
const brandClass = (html: string) =>
  html.match(/<a[^>]*aria-label="Go to threads"[^>]*>/)?.[0].match(/class="([^"]*)"/)?.[1] ?? "";
/** The bare `hidden` utility (not `overflow-hidden` and the like). */
const HIDDEN_CLASS = /(^|\s)hidden(\s|$)/;

describe("SidebarChromeHeader", () => {
  it("keeps the drawer toggle and the footer's Settings outside the phone Home", async () => {
    const html = await renderChrome(false);
    expect(count(html, DRAWER_TOGGLE)).toBe(1);
    expect(count(html, button("Open settings"))).toBe(0);
    expect(count(html, button("Settings"))).toBe(1);
    // The brand stays a desktop-width title: hidden beside the toggle on narrow windows.
    expect(brandClass(html)).toMatch(HIDDEN_CLASS);
    expect(html).not.toContain("data-phone-home-brand");
  });

  it("shows apps/mobile's Home header on the phone Home: brand title, settings, no toggle", async () => {
    const html = await renderChrome(true);
    expect(count(html, DRAWER_TOGGLE)).toBe(0);
    expect(brandClass(html)).not.toMatch(HIDDEN_CLASS);
    // Sized as apps/mobile's CompactBrandTitle by phone-parity.css.
    expect(html).toContain("data-phone-home-brand");
    expect(count(html, button("Open settings"))).toBe(1);
    // Settings moves to the header, so the footer no longer repeats it.
    expect(count(html, button("Settings"))).toBe(0);
    expect(count(html, button("Pull Requests"))).toBe(1);
    expect(count(html, button("Usage"))).toBe(1);
  });
});
