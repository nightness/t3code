import * as NodeURL from "node:url";

const denextModule = (path: string) =>
  NodeURL.fileURLToPath(new URL(`../node_modules/@denext/denext/src/${path}`, import.meta.url));

/**
 * React entry points → denext's React-compat modules (the files behind
 * `@denext/denext`'s `./react*` exports), for the opt-in `denext` test project.
 */
export const DENEXT_REACT_ENTRIES: Record<string, string> = {
  react: denextModule("compat/react.js"),
  "react/jsx-runtime": denextModule("jsx/jsx-runtime.js"),
  "react/jsx-dev-runtime": denextModule("jsx/jsx-runtime.js"),
  // Emitted by the React Compiler preset in vite.config.ts.
  "react/compiler-runtime": denextModule("runtime/compiler-runtime.js"),
  "react-dom": denextModule("compat/react-dom.js"),
  "react-dom/client": denextModule("compat/react-dom-client.js"),
  "react-dom/server": denextModule("compat/react-dom-server.js"),
  "react-is": denextModule("compat/react-is.js"),
};

/** Exact-match aliases, so `react-dom/client` is not caught by `react-dom`. */
export const denextReactAliases = Object.entries(DENEXT_REACT_ENTRIES).map(
  ([specifier, replacement]) => ({
    find: new RegExp(`^${specifier.replace(/[/.-]/g, "\\$&")}$`),
    replacement,
  }),
);

/**
 * Test files the `denext` project cannot run, by cause. Everything else in the
 * unit suite runs unchanged.
 */
export const DENEXT_TEST_EXCLUDES: string[] = [
  // Builds a fixture bundle against real React's package directory (React Refresh
  // wiring for Vite's bundled dev), so it is about the Vite toolchain, not the runtime.
  "src/bundledDev.test.ts",
  // One case re-renders the root with identical props after mutating a module-level mock
  // the component reads without subscribing. denext implicitly memoizes function
  // components (https://denext.dev/docs KNOWN-DIFFERENCES), so it keeps the committed
  // output; in the app the real store hook subscribes and re-renders. The file's other
  // 10 cases pass on denext.
  "src/components/preview/PreviewView.test.tsx",
  // react-test-renderer carries its own copy of React's reconciler and reads
  // React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, which no
  // React reimplementation provides.
  "src/browser/HostedBrowserWebview.test.tsx",
  "src/components/chat/AssistantCitationChip.test.tsx",
  "src/components/chat/ComposerBannerStack.test.tsx",
  "src/components/chat/composerEventScope.test.ts",
  "src/components/chat/MessagesTimeline.test.tsx",
  "src/components/ChatMarkdown.test.tsx",
  "src/components/cloud/CloudEnvironmentConnectList.test.tsx",
  "src/components/device/DeviceStreamView.test.tsx",
  "src/components/diffs/DiffFileTree.test.tsx",
  "src/components/diffs/StyledDiffCodeView.test.tsx",
  "src/components/files/AttachmentFilePreview.test.tsx",
  "src/components/files/useFileSaveCoordinator.test.tsx",
  "src/components/preview/PreviewAutomationHosts.test.tsx",
  "src/components/preview/PreviewFaviconIcon.test.tsx",
  "src/components/projectScriptEditor.test.tsx",
  "src/components/pullRequest/PullRequestDetailPanel.test.tsx",
  "src/components/pullRequest/PullRequestSummaryTab.test.tsx",
  "src/components/pullRequest/usePullRequestFilesViewed.test.tsx",
  "src/components/ServerUpdateAction.test.tsx",
  "src/components/settings/colorPickers.test.tsx",
  "src/components/settings/IntegrationsSettings.test.tsx",
  "src/components/settings/SourceControlWritingSettings.test.tsx",
  "src/components/Sidebar.pointer.test.ts",
  "src/components/ThreadNotificationCoordinator.badge.test.tsx",
  "src/components/ThreadNotificationCoordinator.test.tsx",
  "src/components/usage/UsagePage.refresh.test.tsx",
  "src/hooks/useEnvironmentDisconnectDelay.test.tsx",
  "src/hooks/useLongPress.test.ts",
  "src/hooks/useResizableWidth.test.tsx",
  "src/panelAnimations.test.tsx",
  "src/state/usage.test.tsx",
];
