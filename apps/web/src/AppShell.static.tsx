/**
 * The prerendered app shell (`spa.shell` in denext.config.ts): denext renders this component into
 * `#root` at build, so the first frame is the app's own layout, and its composer takes typing
 * before the bundle has loaded. When the app has rendered off-screen, denext swaps it in and the
 * Tiptap composer takes what was typed (ComposerPromptEditorTiptap's shell handoff).
 *
 * It is pure: the elements and class names the booted app renders for the same screen (the
 * sidebar frame, the header, the draft landing's composer), with nothing that needs the app's
 * state. Data the shell cannot know yet (thread rows, the project name, the model picker) is left
 * out, never invented. The boot script (./appShellBoot.ts) sets `<html data-t3-shell>` before
 * this markup is parsed: "draft" centers the composer under the (wordless) hero, "thread" docks
 * it to the bottom, as ChatView does, and "splash" is index.html's logo splash, which every other
 * route keeps.
 *
 * AppShell.static.test.tsx keeps this module's imports to React and lucide-react (and the
 * app's icon vocabulary over it): no atoms, stores, contracts or Effect. The phone exports take
 * ./AppShell.static.mobile.tsx.
 */
import {
  ChartNoAxesColumnIcon,
  FolderPlusIcon,
  ListFilterIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PaperclipIcon,
  SearchIcon,
  SettingsIcon,
  SquareMenuIcon,
  SquarePenIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { BootSplash } from "./AppShell.splash";
import { PullRequestGlyph } from "./components/pullRequest/pullRequestIcons";

// components/composerPlaceholder.ts
const COMPOSER_PLACEHOLDER = "Ask for changes, send follow-ups, or attach images";

// Shown for one mode only (the boot script's `<html data-t3-shell>`).
const DRAFT_ONLY = "[html:not([data-t3-shell=draft])_&]:hidden";
// ChatView's composer overlay: centered for the draft landing, docked to the bottom in a thread.
// Below sm a thread's composer rests collapsed (ChatComposer's isComposerCollapsedMobile), a
// different shape, so the shell leaves it to the app there.
const THREAD_DOCKED =
  "[html[data-t3-shell=thread]_&]:top-auto [html[data-t3-shell=thread]_&]:block [html[data-t3-shell=thread]_&]:pt-1.5 sm:[html[data-t3-shell=thread]_&]:pt-2 max-sm:[html[data-t3-shell=thread]_&]:hidden";
const CHROME_ONLY = "[html[data-t3-shell=splash]_&]:hidden";
const SPLASH_ONLY = "[html:not([data-t3-shell=splash])_&]:hidden";

const SIDEBAR_MENU_BUTTON =
  "peer/menu-button flex cursor-pointer items-center gap-[var(--sidebar-control-gap)] overflow-hidden text-left outline-hidden ring-ring transition-[width,height,padding] hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 active:bg-sidebar-row-active active:text-sidebar-foreground disabled:pointer-events-none disabled:opacity-64 aria-disabled:pointer-events-none aria-disabled:opacity-64 data-[active=true]:bg-sidebar-row-selected data-[active=true]:font-medium data-[active=true]:text-sidebar-foreground data-[state=open]:hover:bg-sidebar-row-hover data-[state=open]:hover:text-sidebar-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-[var(--sidebar-content-inset)]! [&>span:last-child]:truncate [&>svg:not([class*='size-'])]:size-4 [&>svg]:shrink-0 [&>svg]:text-[var(--sidebar-icon-color)] hover:[&>svg]:text-sidebar-foreground active:[&>svg]:text-sidebar-foreground data-[active=true]:[&>svg]:text-sidebar-foreground";
const SIDEBAR_ICON_BUTTON = `${SIDEBAR_MENU_BUTTON} justify-center rounded-[var(--control-radius)] p-0 font-medium text-sidebar-muted-foreground/80`;
const ICON_BUTTON =
  "[&_svg]:-mx-0.5 relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[var(--control-radius)] border font-medium text-base outline-none transition-[box-shadow,scale] [&:active:not([aria-haspopup])]:scale-[0.97] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--control-radius)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 aria-disabled:cursor-not-allowed aria-disabled:opacity-64 sm:text-sm [&_svg:not([class*='text-'])]:text-[var(--control-icon-color)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [--control-icon-color:var(--contrast-muted-foreground)] border-transparent text-foreground data-pressed:bg-accent [:hover,[data-pressed]]:bg-accent";
const PANEL_TOGGLE =
  "[&_svg]:-mx-0.5 relative inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium text-base outline-none transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none aria-disabled:opacity-64 sm:text-sm [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 h-8 min-w-8 px-[calc(--spacing(1.5)-1px)] sm:h-7 sm:min-w-7 border-transparent text-foreground shadow-none [:disabled,:active,[data-pressed]]:shadow-none before:shadow-none data-pressed:bg-accent data-pressed:text-accent-foreground disabled:opacity-100 disabled:text-muted-foreground disabled:[&_svg]:opacity-100 shrink-0 [-webkit-app-region:no-drag]";

/** components/T3Wordmark.tsx, in the sidebar header's brand lockup. */
function Brand() {
  return (
    <span className="inline-flex min-w-0 items-baseline font-medium gap-1 text-sm tracking-tight">
      <svg
        aria-label="T3"
        className="h-[1cap] w-auto shrink-0"
        viewBox="15.5309 37 94.3941 56.96"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M33.4509 93V47.56H15.5309V37H64.3309V47.56H46.4109V93H33.4509ZM86.7253 93.96C82.832 93.96 78.9653 93.4533 75.1253 92.44C71.2853 91.3733 68.032 89.88 65.3653 87.96L70.4053 78.04C72.5386 79.5867 75.0186 80.8133 77.8453 81.72C80.672 82.6267 83.5253 83.08 86.4053 83.08C89.6586 83.08 92.2186 82.44 94.0853 81.16C95.952 79.88 96.8853 78.12 96.8853 75.88C96.8853 73.7467 96.0586 72.0667 94.4053 70.84C92.752 69.6133 90.0853 69 86.4053 69H80.4853V60.44L96.0853 42.76L97.5253 47.4H68.1653V37H107.365V45.4L91.8453 63.08L85.2853 59.32H89.0453C95.9253 59.32 101.125 60.8667 104.645 63.96C108.165 67.0533 109.925 71.0267 109.925 75.88C109.925 79.0267 109.099 81.9867 107.445 84.76C105.792 87.48 103.259 89.6933 99.8453 91.4C96.432 93.1067 92.0586 93.96 86.7253 93.96Z"
          fill="currentColor"
        />
      </svg>
      <span className="truncate [text-box:trim-both_cap_alphabetic] text-muted-foreground">
        Code
      </span>
    </span>
  );
}

/** The thread sidebar's frame (components/ui/sidebar.tsx + Sidebar.tsx), without its rows. */
function ShellSidebar() {
  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-collapsible=""
      data-side="left"
      data-slot="sidebar"
      data-state="expanded"
      data-variant="sidebar"
    >
      <div
        className="relative w-(--sidebar-width) bg-transparent group-data-[collapsible=offcanvas]:w-0"
        data-slot="sidebar-gap"
      />
      <div
        className="fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) md:flex left-0 group-data-[side=left]:border-r"
        data-slot="sidebar-container"
        role="navigation"
        aria-label="Threads"
      >
        <div
          className="flex h-full w-full flex-col bg-sidebar surface-grain"
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          <div className="relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 px-3 md:pl-0">
            <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
              <span className="relative z-10 h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md ml-[var(--workspace-titlebar-content-left)] hidden md:flex text-foreground">
                <Brand />
              </span>
            </div>
          </div>
          <div className="w-full shrink-0">
            <div
              className="relative flex w-full min-w-0 flex-col p-[var(--sidebar-content-inset)] z-[1]"
              data-sidebar="group"
              data-slot="sidebar-group"
            >
              <div className="flex items-center gap-1">
                <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground">
                  <SearchIcon
                    className="size-4 shrink-0 text-(--sidebar-icon-color)"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate leading-normal">Search</span>
                </div>
                <div className="flex shrink-0 items-center">
                  <span className={`${SIDEBAR_ICON_BUTTON} relative size-7 shrink-0`}>
                    <ListFilterIcon className="size-4" aria-hidden="true" />
                  </span>
                  <span className={`${SIDEBAR_ICON_BUTTON} relative size-7 shrink-0`}>
                    <FolderPlusIcon aria-hidden="true" />
                  </span>
                  <span className={`${SIDEBAR_ICON_BUTTON} relative size-7 shrink-0`}>
                    <SquarePenIcon aria-hidden="true" />
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1" />
          <div
            className="flex flex-col gap-2 px-[var(--sidebar-content-inset)] py-1"
            data-sidebar="footer"
            data-slot="sidebar-footer"
          >
            <ul className="flex w-full min-w-0 gap-1 flex-row items-center">
              {(
                [
                  ["settings", SettingsIcon],
                  ["pull-requests", PullRequestGlyph.pullRequest],
                  ["usage", ChartNoAxesColumnIcon],
                ] as const
              ).map(([name, Icon]) => (
                <li key={name} className="group/menu-item relative shrink-0">
                  <span className={`${SIDEBAR_ICON_BUTTON} size-8`}>
                    <Icon aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The chat header's right-hand panel toggles (components/chat/PanelLayoutControls.tsx). */
function ShellPanelControls() {
  return (
    <div className="pointer-events-none fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-50 mr-px flex h-[var(--workspace-topbar-height)] items-center gap-1 [-webkit-app-region:no-drag]">
      <div className="pointer-events-auto flex h-full items-center">
        <div className="flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          {/* Pressed while the details card sits inline, which needs the room ShellMain's lane
              leaves for it (a narrower window opens it as a popover). */}
          <span
            className={`${PANEL_TOGGLE} @min-[1012px]/chat-header:bg-accent @min-[1012px]/chat-header:text-accent-foreground`}
          >
            <SquareMenuIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="flex shrink-0">
            <span className={PANEL_TOGGLE}>
              <PanelBottomIcon className="size-4" aria-hidden="true" />
            </span>
          </span>
          <span className="flex shrink-0">
            <span className={PANEL_TOGGLE}>
              <PanelRightIcon className="size-4" aria-hidden="true" />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The composer (components/chat/ComposerSurface + ChatComposer + ComposerPromptEditorTiptap) with
 * a plain textarea in the editor's box. `data-denext-shell-key="composer"` hands its text,
 * selection and focus to the Tiptap editor carrying the same key.
 */
function ShellComposer() {
  return (
    <div
      data-slot="composer-shell"
      className="@container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-(--chat-content-max-width) [--chat-composer-drawer-inset:1.375rem] [--chat-composer-glass-surface:var(--card)] [--chat-composer-outline:rgb(0_0_0/8%)] dark:[--chat-composer-glass-surface:var(--surface-raised)] dark:[--chat-composer-highlight:rgb(255_255_255/3%)] dark:[--chat-composer-outline:color-mix(in_srgb,var(--color-white)_5%,transparent)] [html[data-theme-id]_&]:[--chat-composer-glass-surface:var(--app-theme-surface-raised)] [html[data-theme-id]_&]:[--chat-composer-outline:var(--app-theme-toolbar-border)] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-highlight:color-mix(in_srgb,var(--app-theme-input)_12%,transparent)] dark:[html[data-theme-id]:not([data-theme-id=t3-chat])_&]:[--chat-composer-outline:color-mix(in_srgb,var(--app-theme-input)_30%,var(--background))] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-highlight:color-mix(in_srgb,#432d48_12%,transparent)] dark:[html[data-theme-id=t3-chat]_&]:[--chat-composer-outline:#241e28] before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-3xl before:bg-(--chat-composer-glass-surface)/(--glass-opacity) before:backdrop-blur-(--glass-blur) before:backdrop-saturate-(--glass-saturation) not-supports-[((backdrop-filter:blur(1px))_or_(-webkit-backdrop-filter:blur(1px)))]:before:bg-(--chat-composer-glass-surface)"
    >
      <div
        data-slot="composer-host"
        className="relative z-10 w-full rounded-3xl shadow-composer after:z-1 dark:shadow-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--chat-composer-outline) dark:after:inset-shadow-2xs dark:after:inset-shadow-(color:--chat-composer-highlight)"
      >
        <div className="relative z-10">
          <div className="mx-auto w-full min-w-0 max-w-(--chat-content-max-width)">
            <div className="relative">
              <div className="group relative z-10 rounded-3xl p-px">
                <div className="rounded-3xl">
                  <div className="relative px-3 pb-2 sm:px-4 pt-3.5 sm:pt-4">
                    <div className="relative">
                      <div className="relative flow-root font-(family-name:--font-composer,var(--font-sans)) text-(length:--font-size-prompt,var(--text-sm)) max-sm:pointer-coarse:text-(length:--font-size-prompt-touch)">
                        <textarea
                          data-denext-shell-key="composer"
                          data-t3-shell-composer=""
                          aria-label="Message"
                          placeholder=" "
                          rows={1}
                          spellCheck={false}
                          className="peer composer-tiptap -m-1 block max-h-52 min-h-19.5 w-[calc(100%+0.5rem)] resize-none overflow-y-auto p-1 whitespace-pre-wrap wrap-break-word bg-transparent leading-relaxed text-foreground focus:outline-none"
                        />
                        <div className="pointer-events-none absolute inset-0 leading-relaxed text-placeholder/75 peer-[:not(:placeholder-shown)]:hidden">
                          {COMPOSER_PLACEHOLDER}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-nowrap items-center justify-between overflow-visible px-3 pb-3 sm:px-4 sm:pb-4 gap-2 sm:gap-0">
                    <div className="relative -m-1 -ms-3.5 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 ps-3.5" />
                    <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
                      <span className={`${ICON_BUTTON} size-8 sm:size-7`}>
                        <PaperclipIcon aria-hidden="true" />
                      </span>
                      <span className="inline-flex">
                        <span className="relative isolate flex h-9 w-9 items-center justify-center overflow-hidden rounded-full opacity-64 sm:h-8 sm:w-8 bg-message-action text-message-action-foreground">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 14 14"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The chat canvas lane: chat stays centered, moving left only as far as the thread details card
 * (280px, 12px from the edge, shown by default once a 40rem chat fits beside it) needs, as
 * components/chat/chatCanvasLayout.ts lays it out. The card itself is the app's to render.
 */
const CANVAS_LANE_STYLE = {
  "--t3-shell-chat-width":
    "min(var(--chat-content-max-width), 100cqw - 6rem, 100cqw - 324px - 3rem)",
  "--t3-shell-chat-left":
    "max(3rem, min((100cqw - var(--t3-shell-chat-width)) / 2, 100cqw - 324px - var(--t3-shell-chat-width)))",
} as CSSProperties;

function ShellMain({ children }: { readonly children?: ReactNode }) {
  return (
    <main
      className="relative flex min-w-0 w-full flex-1 flex-col bg-background surface-grain h-svh min-h-0 overflow-hidden overscroll-y-none md:h-dvh"
      data-slot="sidebar-inset"
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
        <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden flex-1">
          <header className="@container/chat-header relative bg-background flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center pl-(--workspace-gutter-start) pr-(--workspace-gutter-end) [[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)] max-md:[[data-sidebar-state=expanded]_&]:pl-[var(--workspace-titlebar-content-left)]">
            <ShellPanelControls />
          </header>
          <div className="relative flex min-h-0 min-w-0 flex-1">
            <div
              className="@container relative flex min-h-0 min-w-0 flex-1 flex-col"
              style={CANVAS_LANE_STYLE}
            >
              <div className="relative flex min-h-0 flex-1 flex-col bg-background" />
              {children}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AppShell() {
  return (
    <>
      <div
        className={`group/sidebar-wrapper flex min-h-svh w-full max-sm:[--workspace-titlebar-control-size:--spacing(8)] h-dvh! min-h-0! [html[data-t3-shell-traffic-lights]_&]:[--workspace-controls-left:var(--desktop-window-controls-inset,90px)] ${CHROME_ONLY}`}
        data-sidebar-state="expanded"
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": "var(--t3-shell-sidebar-width, 16rem)",
            "--sidebar-width-icon": "3rem",
            "--workspace-titlebar-content-left":
              "calc(var(--workspace-controls-left) + var(--workspace-titlebar-control-size) + var(--workspace-titlebar-control-gap))",
          } as CSSProperties
        }
      >
        <ShellSidebar />
        <ShellMain>
          <div
            className={`pointer-events-none absolute inset-0 z-20 flex items-center @min-[1012px]:[--chat-lane-inset-end:max(0px,100cqw_-_2_*_var(--t3-shell-chat-left)_-_var(--t3-shell-chat-width))] ${THREAD_DOCKED}`}
          >
            <div className="chat-composer-lane w-full">
              <div className="group/composer-stack pointer-events-auto relative z-10 mx-auto w-full max-w-(--chat-content-max-width)">
                <div className={`absolute inset-x-0 bottom-full ${DRAFT_ONLY}`}>
                  <div className="pb-4">
                    {/* DraftHeroHeadline's box: its words name a project the shell cannot know. */}
                    <div className="mx-auto flex w-full max-w-5xl flex-col items-center">
                      <h1 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
                        {" "}
                      </h1>
                      <p className="mt-2 flex h-6 items-center text-sm" />
                    </div>
                  </div>
                </div>
                <div className="relative z-10">
                  <ShellComposer />
                  <div className="h-[calc(env(safe-area-inset-bottom)+1rem)] sm:h-[calc(env(safe-area-inset-bottom)+1.25rem)]" />
                </div>
              </div>
            </div>
          </div>
        </ShellMain>
        <div className="pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 ml-px flex h-[var(--workspace-topbar-height)] items-center">
          <span
            className={`${ICON_BUTTON} size-9 sm:size-8 size-[var(--workspace-titlebar-control-size)]! [-webkit-app-region:no-drag] pointer-events-auto`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="size-4"
            >
              <path d="M5 3C9.6667 3 14.3333 3 19 3C20.1046 3 21 3.8954 21 5C21 9.6667 21 14.3333 21 19C21 20.1046 20.1046 21 19 21C14.3333 21 9.6667 21 5 21C3.8954 21 3 20.1046 3 19C3 14.3333 3 9.6667 3 5C3 3.8954 3.8954 3 5 3ZM9 3C9 9 9 15 9 21" />
              {/* The open sidebar's chevron; below md the sidebar starts closed (a sheet). */}
              <path className="max-md:hidden" d="M16 15C15 14 14 13 13 12C14 11 15 10 16 9" />
            </svg>
          </span>
        </div>
      </div>
      <div className={`contents ${SPLASH_ONLY}`}>
        <BootSplash />
      </div>
    </>
  );
}
