// @effect-diagnostics nodeBuiltinImport:off - reads phone-parity.css and denext.config.ts as text.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DEFAULT_SANS_FONT_STACK } from "../appearanceFonts";

const css = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("./phone-parity.css", import.meta.url)),
  "utf8",
);

const config = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../../denext.config.ts", import.meta.url)),
  "utf8",
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("phone parity", () => {
  it("scopes every rule to html[data-phone-parity], so web and desktop never match", () => {
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((block) => (block.split("{")[0] ?? "").replace(/\s+/g, " ").trim())
      .filter((selector) => selector.length > 0);
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      // The root, a descendant of it, or the root narrowed to one phone platform.
      expect(selector).toMatch(
        /^html\[data-phone-parity\](\[data-phone-platform="(ios|android)"\])?( |$)/,
      );
    }
  });

  it("is off in the web build and on in the phone exports' platform file", async () => {
    const dataset: Record<string, string> = {};
    const added: Array<{ family: string; descriptors: FontFaceDescriptors }> = [];
    vi.stubGlobal("document", {
      documentElement: { dataset },
      fonts: {
        add: (face: { family: string; descriptors: FontFaceDescriptors }) => added.push(face),
      },
    });
    vi.stubGlobal(
      "FontFace",
      class {
        constructor(
          readonly family: string,
          readonly source: string,
          readonly descriptors: FontFaceDescriptors,
        ) {}
        load() {
          return Promise.resolve(this);
        }
      },
    );
    await import("./phoneParity");
    expect(dataset.phoneParity).toBeUndefined();
    expect(added).toEqual([]);
    await import("./phoneParity.mobile");
    expect(dataset.phoneParity).toBe("");
    // The iOS export (phonePlatform.ts); the Android export resolves phonePlatform.android.ts.
    expect(dataset.phonePlatform).toBe("ios");
    // apps/mobile's three DM Sans weights (app.config.ts: 400Regular, 500Medium, 700Bold).
    expect(added.map((face) => [face.family, face.descriptors.weight])).toEqual([
      ["DM Sans", "400"],
      ["DM Sans", "500"],
      ["DM Sans", "700"],
    ]);
  });

  it("puts DM Sans first in the phone exports' --font-sans, over the web stack", () => {
    const rule = /html\[data-phone-parity\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain(`--font-sans: "DM Sans", ${DEFAULT_SANS_FONT_STACK};`);
  });

  it("lets body text follow --font-sans through the boot shell's inline style", () => {
    // spa.head's boot style is linked after index.css (denext 3.4), so its body rule must read
    // the token, not spell the web stack, or it outranks index.css and DM Sans never reaches body.
    // The head is one string literal, its line breaks spelled `\n`.
    const bodyRule = /\\n\s*body \{([^}]*)\}/.exec(config)?.[1] ?? "";
    expect(bodyRule).toContain(`font-family: var(--font-sans, ${DEFAULT_SANS_FONT_STACK});`);
  });

  it("marks each phone export with its platform", async () => {
    const ios = await import("./phonePlatform");
    const android = await import("./phonePlatform.android");
    expect([ios.PHONE_PLATFORM, android.PHONE_PLATFORM]).toEqual(["ios", "android"]);
  });

  it("insets the iOS phone Home rows with a hairline and leaves Android's flat", () => {
    expect(css).toMatch(
      /\[data-phone-home\]\s+li\[data-thread-item\]::after\s*\{[^}]*height: 1px;/,
    );
    expect(css).toMatch(
      /\[data-phone-platform="android"\]\s+\[data-phone-home\]\s+li\[data-thread-item\]::after\s*\{\s*content: none;/,
    );
  });

  it("lets the phone Home's list always move under a drag, as apps/mobile's bounces", () => {
    const content =
      /\[data-phone-home\]\s+\[data-slot="sidebar-content"\]\s*\{([^}]*min-height[^}]*)\}/.exec(
        css,
      )?.[1] ?? "";
    expect(content).toMatch(/min-height:\s*calc\(100% \+ 1px\)/);
  });

  it("leaves each phone stack screen one scroller: the stack's screen body does not scroll", () => {
    expect(css).toMatch(
      /\[data-dnx-stack\]\s+\[data-dnx-screen-body\]\s*\{\s*overflow:\s*hidden !important;/,
    );
  });
});
