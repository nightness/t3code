import {
  ClientSettingsSchema,
  DEFAULT_CODE_FONT_SIZE,
  DEFAULT_INTERFACE_FONT_SIZE,
  DEFAULT_PROMPT_FONT_SIZE,
  MAX_CODE_FONT_SIZE,
  MAX_INTERFACE_FONT_SIZE,
  MAX_PROMPT_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_INTERFACE_FONT_SIZE,
  MIN_PROMPT_FONT_SIZE,
} from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { applyAppearanceContrast } from "./appearanceContrast";
import { applyAppearanceFontVariables } from "./appearanceFonts";
import {
  applyShellAppearanceStyle,
  readShellAppearanceSettings,
  resolveAppShellMode,
  resolveShellSidebarWidth,
  SHELL_FONT_SIZE_BOUNDS,
  type ShellAppearanceSettings,
} from "./appShellBoot.logic";
import { resolveInitialThreadSidebarWidth } from "./components/threadSidebarWidth";

const decodeClientSettings = Schema.decodeSync(ClientSettingsSchema);

/** An element's style as the appliers see it, recording what they leave set. */
function recordingStyle() {
  const properties = new Map<string, string>();
  return {
    properties,
    style: {
      fontSize: "",
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
      removeProperty(name: string) {
        const previous = properties.get(name) ?? "";
        properties.delete(name);
        return previous;
      },
    },
  };
}

/** What routes/__root.tsx's appearance syncs write for these settings once the app mounts. */
function appliedByApp(settings: ShellAppearanceSettings) {
  const target = recordingStyle();
  const root = { style: target.style } as unknown as HTMLElement;
  applyAppearanceContrast(root, settings.appearanceContrast as never);
  // GlassAppearanceSync
  target.style.setProperty("--glass-opacity", `${settings.glassOpacity}%`);
  if (settings.glassOpacity === 100) target.style.setProperty("--glass-blur", "0px");
  else target.style.removeProperty("--glass-blur");
  applyAppearanceFontVariables(root, {
    sans: settings.fontFamilySans,
    code: settings.fontFamilyCode,
    composer: settings.fontFamilyComposer,
    sizeInterface: settings.fontSizeInterface,
    sizePrompt: settings.fontSizePrompt,
    sizeCode: settings.fontSizeCode,
    smoothing: settings.fontSmoothing,
  });
  return { properties: target.properties, fontSize: target.style.fontSize };
}

function appliedByShell(settings: ShellAppearanceSettings) {
  const target = recordingStyle();
  applyShellAppearanceStyle(target.style, settings);
  return { properties: target.properties, fontSize: target.style.fontSize };
}

describe("resolveAppShellMode", () => {
  it("lands on a draft at the root and on a draft route", () => {
    expect(resolveAppShellMode("/")).toBe("draft");
    expect(resolveAppShellMode("")).toBe("draft");
    expect(resolveAppShellMode("/draft/7f0c")).toBe("draft");
  });

  it("treats an environment and thread pair as a thread", () => {
    expect(resolveAppShellMode("/env-1/thread-1")).toBe("thread");
    expect(resolveAppShellMode("/env-1/thread-1/")).toBe("thread");
  });

  it("keeps the splash for every other route", () => {
    for (const path of [
      "/settings",
      "/settings/general",
      "/projects/abc",
      "/pull-requests",
      "/usage",
      "/welcome",
      "/pair",
      "/connect",
      "/connect-agent",
      "/env-1",
      "/a/b/c",
    ]) {
      expect(resolveAppShellMode(path), path).toBe("splash");
    }
  });
});

describe("resolveShellSidebarWidth", () => {
  it("matches the width AppSidebarLayout first renders", () => {
    for (const stored of [null, 120, 256, 300, 500, 2000]) {
      for (const viewport of [400, 900, 1280, 1440, 2560]) {
        expect(resolveShellSidebarWidth(stored, viewport)).toBe(
          resolveInitialThreadSidebarWidth(stored, viewport),
        );
      }
    }
  });

  it("ignores a stored value that is not a number", () => {
    expect(resolveShellSidebarWidth("300", 1440)).toBe(
      resolveInitialThreadSidebarWidth(null, 1440),
    );
    expect(resolveShellSidebarWidth(Number.NaN, 1440)).toBe(
      resolveInitialThreadSidebarWidth(null, 1440),
    );
  });
});

describe("readShellAppearanceSettings", () => {
  it("defaults every field the way ClientSettingsSchema does", () => {
    const defaults = decodeClientSettings({});
    expect(readShellAppearanceSettings(null)).toEqual({
      chatWidth: defaults.chatWidth,
      diffColorScheme: defaults.diffColorScheme,
      appearanceContrast: defaults.appearanceContrast,
      glassOpacity: defaults.glassOpacity,
      fontFamilySans: defaults.fontFamilySans,
      fontFamilyCode: defaults.fontFamilyCode,
      fontFamilyComposer: defaults.fontFamilyComposer,
      fontSizeInterface: defaults.fontSizeInterface,
      fontSizePrompt: defaults.fontSizePrompt,
      fontSizeCode: defaults.fontSizeCode,
      fontSmoothing: defaults.fontSmoothing,
    });
  });

  it("reads the stored settings and drops values of the wrong kind", () => {
    const settings = readShellAppearanceSettings(
      JSON.stringify({ chatWidth: "wide", fontSizeInterface: 18, fontFamilySans: 3 }),
    );
    expect(settings.chatWidth).toBe("wide");
    expect(settings.fontSizeInterface).toBe(18);
    expect(settings.fontFamilySans).toBe("");
    expect(readShellAppearanceSettings("{not json").chatWidth).toBe("comfortable");
    expect(readShellAppearanceSettings(JSON.stringify({ chatWidth: "huge" })).chatWidth).toBe(
      "comfortable",
    );
  });

  it("keeps the font size bounds of the contracts", () => {
    expect(SHELL_FONT_SIZE_BOUNDS).toEqual({
      interface: {
        min: MIN_INTERFACE_FONT_SIZE,
        max: MAX_INTERFACE_FONT_SIZE,
        fallback: DEFAULT_INTERFACE_FONT_SIZE,
      },
      prompt: {
        min: MIN_PROMPT_FONT_SIZE,
        max: MAX_PROMPT_FONT_SIZE,
        fallback: DEFAULT_PROMPT_FONT_SIZE,
      },
      code: { min: MIN_CODE_FONT_SIZE, max: MAX_CODE_FONT_SIZE, fallback: DEFAULT_CODE_FONT_SIZE },
    });
  });
});

describe("applyShellAppearanceStyle", () => {
  const defaults = readShellAppearanceSettings(null);
  const cases: Array<[string, ShellAppearanceSettings]> = [
    ["the defaults", defaults],
    [
      "custom families, sizes and smoothing off",
      {
        ...defaults,
        fontFamilySans: "Inter, 'IBM Plex Sans'",
        fontFamilyCode: "JetBrains Mono",
        fontFamilyComposer: "Georgia",
        fontSizeInterface: 18,
        fontSizePrompt: 16,
        fontSizeCode: 12,
        fontSmoothing: false,
      },
    ],
    [
      "opaque glass and raised contrast",
      { ...defaults, glassOpacity: 100, appearanceContrast: 150 },
    ],
    ["lowered contrast", { ...defaults, appearanceContrast: 60 }],
    [
      "out-of-range sizes",
      { ...defaults, fontSizeInterface: 40, fontSizePrompt: 2, fontSizeCode: 15.6 },
    ],
  ];
  it.each(cases)("writes what the app writes for %s", (_name, settings) => {
    expect(appliedByShell(settings)).toEqual(appliedByApp(settings));
  });
});
