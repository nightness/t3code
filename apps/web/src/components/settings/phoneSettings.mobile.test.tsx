// Runs in the `denext` test project only: the module imports denext/navigation, which the unit
// project cannot resolve (vite.config.ts).
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { PhoneSettingsList, shouldRedirectSettingsIndex } from "./phoneSettings.mobile";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubWidth(matchesPhone: boolean) {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: query === "(max-width: 767px)" && matchesPhone }),
  });
}

describe("phone Settings", () => {
  it("shows the list at /settings on a phone, and redirects to General on a wider window", () => {
    stubWidth(true);
    expect(shouldRedirectSettingsIndex()).toBe(false);
    stubWidth(false);
    expect(shouldRedirectSettingsIndex()).toBe(true);
  });

  it("lists every section as a row that pushes its page", async () => {
    const router = createRouter({
      routeTree: createRootRoute({ component: PhoneSettingsList }),
      history: createMemoryHistory({ initialEntries: ["/settings"] }),
    });
    await router.load();
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    for (const label of ["General", "Appearance", "Providers", "Connections"]) {
      expect(html).toMatch(new RegExp(`<button[^>]*>[\\s\\S]*?${label}[\\s\\S]*?</button>`));
    }
    expect(html).toContain('aria-label="Settings sections"');
  });
});
