import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarContent } from "./sidebar";

describe("SidebarContent", () => {
  it("scrolls in the scroll area by default", () => {
    const html = renderToStaticMarkup(<SidebarContent>rows</SidebarContent>);
    expect(html).toContain('data-slot="scroll-area-viewport"');
    expect(html).not.toContain('data-slot="sidebar-scroller"');
  });

  it("scrolls in one plain, height-bounded overflow-y:auto element with plainScroller", () => {
    const html = renderToStaticMarkup(<SidebarContent plainScroller>rows</SidebarContent>);
    expect(html).not.toContain("scroll-area");
    const scroller = /<div[^>]*data-slot="sidebar-scroller"[^>]*>/.exec(html)?.[0] ?? "";
    // Bounded by its flex parent (flex-1 + min-h-0) and the only scroller around the content.
    expect(scroller).toMatch(/\bflex-1\b/);
    expect(scroller).toMatch(/\bmin-h-0\b/);
    expect(scroller).toMatch(/\boverflow-y-auto\b/);
    expect(html).toMatch(
      /data-slot="sidebar-scroller"[^>]*>\s*<div[^>]*data-slot="sidebar-content"/,
    );
    expect(html.match(/overflow-y-auto/g)).toHaveLength(1);
  });
});
