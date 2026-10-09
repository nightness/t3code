// @effect-diagnostics nodeBuiltinImport:off - reads denext-theme.css to check the motion classes exist.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  MOTION_CLASS,
  MotionViewTransition,
  resolveViewTransition,
  RightPanelMotion,
  viewTransitionAvailable,
} from "./ViewTransition";

describe("resolveViewTransition", () => {
  it("prefers the stable export, then the unstable one, else none", () => {
    const Stable = () => null;
    const Unstable = () => null;
    expect(
      resolveViewTransition({ ViewTransition: Stable, unstable_ViewTransition: Unstable }),
    ).toBe(Stable);
    expect(resolveViewTransition({ unstable_ViewTransition: Unstable })).toBe(Unstable);
    expect(resolveViewTransition({})).toBeNull();
  });
});

describe("MotionViewTransition", () => {
  it("renders its children unchanged (no wrapper element of its own)", () => {
    const html = renderToStaticMarkup(
      <MotionViewTransition enter={MOTION_CLASS.enterRise}>
        <section id="panel">content</section>
      </MotionViewTransition>,
    );
    // denext's server renderer may stamp the child (data-dnx-vt); React's leaves it bare.
    expect(html).toMatch(/^<section[^>]*id="panel"/);
    expect(html).toContain("content</section>");
    expect(
      renderToStaticMarkup(<RightPanelMotion surfaceKey={null}>{null}</RightPanelMotion>),
    ).toBe("");
    const panel = renderToStaticMarkup(
      <RightPanelMotion surfaceKey="files">
        <aside>files</aside>
      </RightPanelMotion>,
    );
    // With a ViewTransition runtime the first content arrives in a deferred
    // (Transition) render, so a one-pass server render holds the initial null.
    if (viewTransitionAvailable)
      expect(panel === "" || panel.includes("<aside>files</aside>")).toBe(true);
    else expect(panel).toBe("<aside>files</aside>");
  });

  it("only names classes that denext-theme.css defines", () => {
    const css = NodeFS.readFileSync(
      NodeURL.fileURLToPath(new URL("../denext-theme.css", import.meta.url)),
      "utf8",
    );
    for (const className of Object.values(MOTION_CLASS)) {
      expect(css).toContain(`(.${className})`);
    }
  });
});
