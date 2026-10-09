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
      expect(
        selector === "html[data-phone-parity]" || selector.startsWith("html[data-phone-parity] "),
      ).toBe(true);
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
});
