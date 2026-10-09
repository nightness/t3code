/**
 * The primitive layer of the denext design tokens (denext-theme.css): OKLCH
 * ramps derived from T3's accent with culori, and the neutral elevation and
 * text steps for the stock light and dark appearances.
 *
 * The CSS carries these values as a generated block, so the stylesheet works
 * on both build paths (Vite and denext) with no runtime work. The semantic
 * and component layers in the CSS sit on T3's own semantic variables, which
 * the theme engine (custom themes, VS Code imports, contrast boost) drives,
 * so only the stock palette reads these primitives directly.
 *
 * Regenerate the CSS block after editing this file:
 *   UPDATE_DENEXT_THEME=1 pnpm --filter @t3tools/web test src/denext/designTokens.test.ts
 */
import "culori/css";
import { clampChroma, converter, parse, wcagContrast } from "culori/fn";

export type DesignAppearance = "light" | "dark";

/** T3's stock accent: `--primary` in index.css (the dark value; light is darker). */
export const T3_STOCK_ACCENT = "oklch(0.571 0.21 264)";

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type AccentStep = (typeof ACCENT_STEPS)[number];

// Perceptual lightness per step (OKLCH L), evenly spaced in the middle and
// compressed at the ends, like Tailwind's and Radix's ramps.
const ACCENT_LIGHTNESS: Record<AccentStep, number> = {
  50: 0.975,
  100: 0.94,
  200: 0.885,
  300: 0.81,
  400: 0.715,
  500: 0.62,
  600: 0.54,
  700: 0.465,
  800: 0.39,
  900: 0.315,
  950: 0.25,
};

// Share of the accent's own chroma each step keeps: tints and shades are
// less saturated than the mid steps, so the ramp never clips to neon.
const ACCENT_CHROMA_SHARE: Record<AccentStep, number> = {
  50: 0.1,
  100: 0.22,
  200: 0.42,
  300: 0.66,
  400: 0.88,
  500: 1,
  600: 1,
  700: 0.92,
  800: 0.78,
  900: 0.6,
  950: 0.45,
};

/** Neutral steps, as OKLCH lightness. The hue comes from the accent at a whisper of chroma. */
const NEUTRAL_STEPS = [
  "sunken",
  "base",
  "raised",
  "overlay",
  "hover",
  "text-1",
  "text-2",
  "text-3",
] as const;
export type NeutralStep = (typeof NEUTRAL_STEPS)[number];

/**
 * Elevation by luminance, not shadow (cheap on phone WebViews, and the lists
 * guidance warns against row shadows): the sidebar sits lowest, the canvas
 * above it, cards and the composer above that, menus and dialogs on top.
 * Dark steps stay close to T3's near-black canvas so the app reads as T3.
 */
const NEUTRAL_LIGHTNESS: Record<DesignAppearance, Record<NeutralStep, number>> = {
  dark: {
    sunken: 0.14,
    base: 0.165,
    raised: 0.21,
    overlay: 0.24,
    hover: 0.262,
    "text-1": 0.955,
    "text-2": 0.775,
    "text-3": 0.665,
  },
  light: {
    sunken: 0.968,
    base: 0.988,
    raised: 1,
    overlay: 1,
    hover: 0.945,
    "text-1": 0.255,
    "text-2": 0.43,
    "text-3": 0.515,
  },
};

const NEUTRAL_CHROMA: Record<DesignAppearance, number> = { dark: 0.006, light: 0.004 };
const TEXT_CHROMA: Record<DesignAppearance, number> = { dark: 0.004, light: 0.012 };

const toOklch = converter("oklch");

type Oklch = { mode: "oklch"; l: number; c: number; h?: number };

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Parse any CSS color culori understands into OKLCH, or throw. */
export function parseOklch(color: string): Oklch {
  const parsed = parse(color);
  const oklch = parsed ? (toOklch(parsed) as Oklch | undefined) : undefined;
  if (!oklch) throw new Error(`Not a color: ${color}`);
  return oklch;
}

/** Format an OKLCH color as CSS, its chroma reduced into the sRGB gamut (L and hue kept). */
function formatOklch(color: Oklch): string {
  const mapped = toOklch(clampChroma(color, "oklch", "rgb")) as Oklch;
  const l = round(mapped.l, 3);
  const c = round(mapped.c, 3);
  const h = round(mapped.h ?? 0, 1);
  return `oklch(${l} ${c} ${h})`;
}

/** The 50..950 ramp for an accent: fixed lightness steps at the accent's hue and chroma. */
export function accentRamp(accent: string = T3_STOCK_ACCENT): Record<AccentStep, string> {
  const base = parseOklch(accent);
  const hue = base.h ?? 0;
  const ramp = {} as Record<AccentStep, string>;
  for (const step of ACCENT_STEPS) {
    ramp[step] = formatOklch({
      mode: "oklch",
      l: ACCENT_LIGHTNESS[step],
      c: base.c * ACCENT_CHROMA_SHARE[step],
      h: hue,
    });
  }
  return ramp;
}

/** Neutral surfaces and text for one appearance, tinted toward the accent's hue. */
export function neutralSteps(
  appearance: DesignAppearance,
  accent: string = T3_STOCK_ACCENT,
): Record<NeutralStep, string> {
  const hue = parseOklch(accent).h ?? 0;
  const steps = {} as Record<NeutralStep, string>;
  for (const step of NEUTRAL_STEPS) {
    const isText = step.startsWith("text-");
    steps[step] = formatOklch({
      mode: "oklch",
      l: NEUTRAL_LIGHTNESS[appearance][step],
      c: isText ? TEXT_CHROMA[appearance] : NEUTRAL_CHROMA[appearance],
      h: hue,
    });
  }
  return steps;
}

/**
 * The accent steps the stock palette uses per appearance: the solid control
 * fill, the text/link color on surfaces, and the focus ring.
 */
const STOCK_ACCENT_ROLES: Record<
  DesignAppearance,
  { readonly fill: AccentStep; readonly text: AccentStep; readonly ring: AccentStep }
> = {
  dark: { fill: 600, text: 300, ring: 400 },
  light: { fill: 600, text: 600, ring: 500 },
};

/** WCAG 2 contrast ratio between two CSS colors. */
export function contrastRatio(foreground: string, background: string): number {
  return wcagContrast(parseOklch(foreground), parseOklch(background));
}

/** The surfaces every text token must stay legible on. */
const TEXT_SURFACES: readonly NeutralStep[] = ["sunken", "base", "raised", "overlay", "hover"];
const TEXT_TOKENS: readonly NeutralStep[] = ["text-1", "text-2", "text-3"];

export interface ContrastCheck {
  readonly appearance: DesignAppearance;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
}

/** Every text-on-surface pair of the stock palette, plus accent text and on-accent text. */
export function stockContrastChecks(accent: string = T3_STOCK_ACCENT): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  const ramp = accentRamp(accent);
  for (const appearance of ["dark", "light"] as const) {
    const neutral = neutralSteps(appearance, accent);
    const roles = STOCK_ACCENT_ROLES[appearance];
    const foregrounds: Array<[string, string]> = [
      ...TEXT_TOKENS.map((token): [string, string] => [token, neutral[token]]),
      [`accent-${roles.text}`, ramp[roles.text]],
    ];
    for (const [name, color] of foregrounds) {
      for (const surface of TEXT_SURFACES) {
        checks.push({
          appearance,
          foreground: name,
          background: surface,
          ratio: round(contrastRatio(color, neutral[surface]), 2),
        });
      }
    }
    checks.push({
      appearance,
      foreground: "white",
      background: `accent-${roles.fill}`,
      ratio: round(contrastRatio("#ffffff", ramp[roles.fill]), 2),
    });
  }
  return checks;
}

export const GENERATED_BEGIN = "/* @generated:begin denext-theme primitives */";
export const GENERATED_END = "/* @generated:end */";

/** The generated primitive block of denext-theme.css. */
export function renderPrimitiveCss(accent: string = T3_STOCK_ACCENT): string {
  const ramp = accentRamp(accent);
  const lines = [
    GENERATED_BEGIN,
    "/* From src/denext/designTokens.ts; regenerate with",
    "   `UPDATE_DENEXT_THEME=1 pnpm --filter @t3tools/web test src/denext/designTokens.test.ts`. */",
    ":root {",
  ];
  for (const step of ACCENT_STEPS) lines.push(`  --dnx-accent-${step}: ${ramp[step]};`);
  for (const appearance of ["light", "dark"] as const) {
    const neutral = neutralSteps(appearance, accent);
    for (const step of NEUTRAL_STEPS) {
      lines.push(`  --dnx-${appearance}-${step}: ${neutral[step]};`);
    }
  }
  lines.push("}", GENERATED_END);
  return lines.join("\n");
}

/** Replace the generated block inside a stylesheet's source. */
export function replaceGeneratedBlock(css: string, block: string = renderPrimitiveCss()): string {
  const start = css.indexOf(GENERATED_BEGIN);
  const end = css.indexOf(GENERATED_END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("denext-theme.css has no generated primitive block");
  }
  return css.slice(0, start) + block + css.slice(end + GENERATED_END.length);
}
