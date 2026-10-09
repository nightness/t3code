// @effect-diagnostics nodeBuiltinImport:off - reads and regenerates denext-theme.css on disk.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";
import { BUILT_IN_THEMES } from "@t3tools/shared/themePalettes";
import { describe, expect, it } from "vite-plus/test";

import {
  ACCENT_STEPS,
  accentRamp,
  contrastRatio,
  GENERATED_BEGIN,
  GENERATED_END,
  neutralSteps,
  parseOklch,
  renderPrimitiveCss,
  replaceGeneratedBlock,
  stockContrastChecks,
  T3_STOCK_ACCENT,
} from "./designTokens";

const THEME_CSS_URL = new URL("../denext-theme.css", import.meta.url);

describe("accentRamp", () => {
  it("keeps the accent's hue and walks lightness down from 50 to 950", () => {
    const ramp = accentRamp(T3_STOCK_ACCENT);
    const hue = parseOklch(T3_STOCK_ACCENT).h ?? 0;
    let previous = Number.POSITIVE_INFINITY;
    for (const step of ACCENT_STEPS) {
      const color = parseOklch(ramp[step]);
      expect(color.l).toBeLessThan(previous);
      previous = color.l;
      // Gamut mapping trims chroma, never the hue.
      expect(Math.abs((color.h ?? hue) - hue)).toBeLessThan(1.5);
    }
  });

  it("derives a ramp from any theme accent", () => {
    for (const theme of BUILT_IN_THEMES) {
      const ramp = accentRamp(theme.colors.accent);
      expect(Object.keys(ramp)).toHaveLength(ACCENT_STEPS.length);
      for (const value of Object.values(ramp)) expect(value).toMatch(/^oklch\(/);
    }
  });

  it("rejects strings that are not colors", () => {
    expect(() => accentRamp("var(--primary)")).toThrow();
  });
});

describe("neutral elevation", () => {
  it("steps surfaces by luminance: sunken < base < raised <= overlay", () => {
    for (const appearance of ["light", "dark"] as const) {
      const steps = neutralSteps(appearance);
      const l = (name: keyof typeof steps) => parseOklch(steps[name]).l;
      expect(l("sunken")).toBeLessThan(l("base"));
      expect(l("base")).toBeLessThan(l("raised"));
      expect(l("raised")).toBeLessThanOrEqual(l("overlay"));
    }
  });
});

describe("WCAG AA on the stock text tokens", () => {
  it("every text token and the accent text reach 4.5:1 on every surface", () => {
    const failures = stockContrastChecks().filter((check) => check.ratio < 4.5);
    expect(failures).toEqual([]);
  });

  it("measures white on the accent fill like a button label", () => {
    const fill = stockContrastChecks().filter((check) => check.foreground === "white");
    expect(fill.map((check) => check.ratio).every((ratio) => ratio >= 4.5)).toBe(true);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
});

describe("denext-theme.css", () => {
  it("carries the generated primitive block", () => {
    const css = NodeFS.readFileSync(NodeURL.fileURLToPath(THEME_CSS_URL), "utf8");
    const expected = replaceGeneratedBlock(css, renderPrimitiveCss());
    if (process.env.UPDATE_DENEXT_THEME === "1" && expected !== css) {
      NodeFS.writeFileSync(NodeURL.fileURLToPath(THEME_CSS_URL), expected);
      return;
    }
    // Stale? UPDATE_DENEXT_THEME=1 pnpm --filter @t3tools/web test src/denext/designTokens.test.ts
    expect(css).toBe(expected);
  });

  it("replaceGeneratedBlock refuses a stylesheet without markers", () => {
    expect(() => replaceGeneratedBlock(":root {}")).toThrow();
    const wrapped = `a{}\n${GENERATED_BEGIN}\nold\n${GENERATED_END}\nb{}`;
    expect(replaceGeneratedBlock(wrapped, "NEW")).toBe("a{}\nNEW\nb{}");
  });
});
