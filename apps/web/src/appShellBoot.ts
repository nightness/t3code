/**
 * `spa.shell.bootScript` (denext.config.ts): runs before the prerendered shell
 * (./AppShell.static.tsx) is parsed, so its first paint is in the user's layout. The theme is
 * already applied by the inline script in `spa.head`; this adds what the shell's geometry and type
 * depend on: which shell the URL gets, the sidebar width, and the appearance settings (fonts,
 * sizes, chat width, contrast, glass). The app writes the same values once it has mounted.
 *
 * denext bundles this module into one classic script inlined into index.html, so it imports
 * nothing but the dependency-free ./appShellBoot.logic.ts.
 */
import {
  applyShellAppearanceStyle,
  CLIENT_SETTINGS_STORAGE_KEY,
  readShellAppearanceSettings,
  resolveAppShellMode,
  resolveShellSidebarWidth,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./appShellBoot.logic";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredNumber(key: string): unknown {
  try {
    const raw = readStorage(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Grow the shell composer with its text, as the editor does, until its max-height scrolls. */
function autosizeShellComposer(event: Event): void {
  const field = event.target;
  if (!(field instanceof HTMLTextAreaElement) || !field.hasAttribute("data-t3-shell-composer")) {
    return;
  }
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
}

const root = document.documentElement;
root.dataset.t3Shell = resolveAppShellMode(window.location.pathname);

const settings = readShellAppearanceSettings(readStorage(CLIENT_SETTINGS_STORAGE_KEY));
root.dataset.chatWidth = settings.chatWidth;
root.dataset.diffColorScheme = settings.diffColorScheme;
applyShellAppearanceStyle(root.style, settings);

root.style.setProperty(
  "--t3-shell-sidebar-width",
  `${resolveShellSidebarWidth(readStoredNumber(THREAD_SIDEBAR_WIDTH_STORAGE_KEY), window.innerWidth)}px`,
);

// AppSidebarLayout leaves room for the macOS traffic lights in the desktop app's windowed mode.
const bridge = (window as { desktopBridge?: { getWindowFullscreenState?: () => boolean } })
  .desktopBridge;
if (
  bridge !== undefined &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform) &&
  !(typeof bridge.getWindowFullscreenState === "function" && bridge.getWindowFullscreenState())
) {
  root.dataset.t3ShellTrafficLights = "";
}

/**
 * Enter sends in the app's composer, so in the shell it neither sends (nothing can yet) nor
 * breaks the line: the text the editor takes over is the text the user would have there.
 * Shift+Enter breaks the line, as in the editor.
 */
function holdShellComposerEnter(event: KeyboardEvent): void {
  const field = event.target;
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    field instanceof HTMLTextAreaElement &&
    field.hasAttribute("data-t3-shell-composer")
  ) {
    event.preventDefault();
  }
}

document.addEventListener("input", autosizeShellComposer, true);
document.addEventListener("keydown", holdShellComposerEnter, true);
