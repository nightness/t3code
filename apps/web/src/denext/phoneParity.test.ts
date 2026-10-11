// @effect-diagnostics nodeBuiltinImport:off - reads phone-parity.css to check its scoping.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const css = NodeFS.readFileSync(
  NodeURL.fileURLToPath(new URL("./phone-parity.css", import.meta.url)),
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
      expect(selector.startsWith("html[data-phone-parity] ")).toBe(true);
    }
  });

  it("is off in the web build and on in the phone exports' platform file", async () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal("document", { documentElement: { dataset } });
    await import("./phoneParity");
    expect(dataset.phoneParity).toBeUndefined();
    await import("./phoneParity.mobile");
    expect(dataset.phoneParity).toBe("");
  });
});
