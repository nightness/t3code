/**
 * The decisions behind the `spa.shell` boot script (./appShellBoot.ts): which shell a URL gets,
 * the sidebar width, and the appearance settings the app applies once it has mounted, so the
 * prerendered shell (./AppShell.static.tsx) paints at the size and in the fonts the app will.
 *
 * The boot script is inlined into index.html ahead of the shell, so this module stays free of
 * imports: no contracts, no Effect. The constants mirror their sources (named beside each), and
 * appShellBoot.logic.test.ts checks them against those sources and the app's own appliers.
 */

/** What the shell shows for a URL; the boot script writes it to `<html data-t3-shell>`. */
export type AppShellMode =
  /** The draft landing: the sidebar, the header and the centered composer. */
  | "draft"
  /** A thread: the sidebar, the header and the composer docked to the bottom. */
  | "thread"
  /** Any other route: the logo splash index.html showed before the shell existed. */
  | "splash";

/** First path segments that name a route rather than an environment (routes/*.tsx). */
const NON_THREAD_SEGMENTS = new Set([
  "connect",
  "connect-agent",
  "draft",
  "pair",
  "projects",
  "pull-requests",
  "settings",
  "usage",
  "welcome",
]);

/** The shell for `pathname`: `/` and `/draft/:id` land on a draft, `/:env/:thread` is a thread. */
export function resolveAppShellMode(pathname: string): AppShellMode {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return "draft";
  if (segments.length === 2 && segments[0] === "draft") return "draft";
  if (segments.length === 2 && !NON_THREAD_SEGMENTS.has(segments[0]!)) return "thread";
  return "splash";
}

// components/threadSidebarWidth.ts
export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

/**
 * The thread sidebar's width in px, as AppSidebarLayout first renders it: the stored width (at
 * least the minimum), capped so the main content keeps its minimum width.
 */
export function resolveShellSidebarWidth(stored: unknown, viewportWidth: number): number {
  const preferred =
    typeof stored === "number" && Number.isFinite(stored)
      ? Math.max(THREAD_SIDEBAR_MIN_WIDTH, stored)
      : THREAD_SIDEBAR_DEFAULT_WIDTH;
  const maximum = Math.max(
    THREAD_SIDEBAR_MIN_WIDTH,
    Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH,
  );
  return Math.min(preferred, maximum);
}

// clientPersistenceStorage.ts
export const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

// @t3tools/contracts settings.ts
export const SHELL_FONT_SIZE_BOUNDS = {
  interface: { min: 12, max: 20, fallback: 16 },
  prompt: { min: 12, max: 20, fallback: 14 },
  code: { min: 10, max: 18, fallback: 13 },
} as const;
const DEFAULT_GLASS_OPACITY = 80;
const DEFAULT_APPEARANCE_CONTRAST = 100;
const CHAT_WIDTHS = ["comfortable", "wide", "full"];
const DIFF_COLOR_SCHEMES = ["red-green", "blue-orange"];

// appearanceFonts.ts
const DEFAULT_SANS_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const DEFAULT_CODE_FONT_STACK =
  '"SF Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

/** The persisted settings the shell reads, as `t3code:client-settings:v1` stores them. */
export interface ShellAppearanceSettings {
  readonly chatWidth: string;
  readonly diffColorScheme: string;
  readonly appearanceContrast: number;
  readonly glassOpacity: number;
  readonly fontFamilySans: string;
  readonly fontFamilyCode: string;
  readonly fontFamilyComposer: string;
  readonly fontSizeInterface: number;
  readonly fontSizePrompt: number;
  readonly fontSizeCode: number;
  readonly fontSmoothing: boolean;
}

function pick<T>(value: unknown, valid: (value: unknown) => value is T, fallback: T): T {
  return valid(value) ? value : fallback;
}
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const oneOf =
  (values: readonly string[]) =>
  (value: unknown): value is string =>
    typeof value === "string" && values.includes(value);

/** The settings from the stored JSON, each field at its schema default when missing or invalid. */
export function readShellAppearanceSettings(raw: string | null): ShellAppearanceSettings {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      stored = parsed as Record<string, unknown>;
    }
  } catch {
    // Unreadable settings: the app falls back to its defaults too.
  }
  return {
    chatWidth: pick(stored.chatWidth, oneOf(CHAT_WIDTHS), "comfortable"),
    diffColorScheme: pick(stored.diffColorScheme, oneOf(DIFF_COLOR_SCHEMES), "red-green"),
    appearanceContrast: pick(stored.appearanceContrast, isNumber, DEFAULT_APPEARANCE_CONTRAST),
    glassOpacity: pick(stored.glassOpacity, isNumber, DEFAULT_GLASS_OPACITY),
    fontFamilySans: pick(stored.fontFamilySans, isString, ""),
    fontFamilyCode: pick(stored.fontFamilyCode, isString, ""),
    fontFamilyComposer: pick(stored.fontFamilyComposer, isString, ""),
    fontSizeInterface: pick(
      stored.fontSizeInterface,
      isNumber,
      SHELL_FONT_SIZE_BOUNDS.interface.fallback,
    ),
    fontSizePrompt: pick(stored.fontSizePrompt, isNumber, SHELL_FONT_SIZE_BOUNDS.prompt.fallback),
    fontSizeCode: pick(stored.fontSizeCode, isNumber, SHELL_FONT_SIZE_BOUNDS.code.fallback),
    fontSmoothing: pick(stored.fontSmoothing, isBoolean, true),
  };
}

/** The style surface the appliers write to (an element's `style`). */
export interface ShellStyleTarget {
  setProperty(name: string, value: string): void;
  removeProperty(name: string): string;
  fontSize: string;
}

function clampFontSize(value: number, bounds: { min: number; max: number; fallback: number }) {
  if (!Number.isFinite(value)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

// appearanceFonts.ts quoteFontFamilyName / cssFontFamilies
function cssFontFamilies(input: string): string | null {
  const families = input
    .split(",")
    .map((name) => {
      const bare = name.trim();
      if (bare.length === 0) return "";
      if (/^(['"]).*\1$/.test(bare)) return bare;
      if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(bare)) return bare;
      return `"${bare.replaceAll('"', "")}"`;
    })
    .filter((name) => name.length > 0);
  return families.length > 0 ? families.join(", ") : null;
}

/**
 * Write what the root route's appearance syncs write once the app mounts (FontAppearanceSync,
 * ContrastAppearanceSync, GlassAppearanceSync in routes/__root.tsx) to the root element's style.
 */
export function applyShellAppearanceStyle(
  style: ShellStyleTarget,
  settings: ShellAppearanceSettings,
): void {
  const contrast = settings.appearanceContrast;
  style.setProperty("--appearance-contrast-base", `${Math.min(contrast, 100)}%`);
  style.setProperty("--appearance-contrast-boost", `${Math.max(contrast - 100, 0)}%`);
  style.setProperty("--appearance-contrast-border-boost", `${Math.max(contrast - 100, 0) / 4}%`);

  style.setProperty("--glass-opacity", `${settings.glassOpacity}%`);
  if (settings.glassOpacity === 100) style.setProperty("--glass-blur", "0px");
  else style.removeProperty("--glass-blur");

  const families: ReadonlyArray<readonly [string, string, string]> = [
    ["--font-sans", settings.fontFamilySans, DEFAULT_SANS_FONT_STACK],
    ["--font-mono", settings.fontFamilyCode, DEFAULT_CODE_FONT_STACK],
    ["--font-composer", settings.fontFamilyComposer, "var(--font-sans)"],
  ];
  for (const [variable, custom, fallback] of families) {
    const list = cssFontFamilies(custom);
    if (list === null) style.removeProperty(variable);
    else style.setProperty(variable, `${list}, ${fallback}`);
  }
  style.fontSize = `${clampFontSize(settings.fontSizeInterface, SHELL_FONT_SIZE_BOUNDS.interface)}px`;
  style.setProperty(
    "--font-size-prompt",
    `${clampFontSize(settings.fontSizePrompt, SHELL_FONT_SIZE_BOUNDS.prompt)}px`,
  );
  const code = clampFontSize(settings.fontSizeCode, SHELL_FONT_SIZE_BOUNDS.code);
  style.setProperty("--font-size-code", `${code}px`);
  style.setProperty("--diffs-font-size", `${code}px`);
  if (settings.fontSmoothing) style.setProperty("-webkit-font-smoothing", "antialiased");
  else style.removeProperty("-webkit-font-smoothing");
}
