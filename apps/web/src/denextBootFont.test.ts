// @effect-diagnostics nodeBuiltinImport:off - reads denext.config.ts as text.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_SANS_FONT_STACK } from "./appearanceFonts";

const config = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("../denext.config.ts", import.meta.url)),
  "utf8",
);

describe("denext boot shell", () => {
  it("lets body text follow --font-sans through the boot shell's inline style", () => {
    // spa.head's boot style is linked after index.css (denext 3.4), so its body rule must read
    // the token, not spell the web stack, or it outranks index.css and a font chosen in
    // Settings -> Appearance never reaches body text. The head is one string literal, its line
    // breaks spelled `\n`.
    const bodyRule = /\\n\s*body \{([^}]*)\}/.exec(config)?.[1] ?? "";
    expect(bodyRule).toContain(`font-family: var(--font-sans, ${DEFAULT_SANS_FONT_STACK});`);
  });
});
