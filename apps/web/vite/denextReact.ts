import * as NodeURL from "node:url";

// Node's URL, not the global: under `@vitest-environment jsdom` the setup file that reads these
// paths (test/denextReactRedirect.ts) sees jsdom's URL, and every path came out as `vite/undefined`.
const denextModule = (path: string) =>
  NodeURL.fileURLToPath(
    new NodeURL.URL(`../node_modules/@denext/denext/src/${path}`, import.meta.url),
  );

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
  // The same shape: each re-renders the root after mutating a module-level mock the component
  // reads without subscribing (UsagePage's `canGoBack`, terminalSessionAvailability's query state).
  "src/components/usage/UsagePage.test.tsx",
  "src/state/terminalSessionAvailability.test.ts",
  // react-test-renderer carries its own copy of React's reconciler and reads
  // React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, which no
  // React reimplementation provides.
  "src/browser/HostedBrowserWebview.test.tsx",
  "src/cloud/useCloudLinkController.test.tsx",
  "src/components/chat/AssistantCitationChip.test.tsx",
  "src/components/chat/ComposerBannerStack.test.tsx",
  "src/components/chat/composerEventScope.test.ts",
  "src/components/chat/ComposerPendingUserInputPanel.permissions.test.tsx",
  "src/components/chat/MessagesTimeline.test.tsx",
  "src/components/chat/OpenInPicker.test.tsx",
  "src/components/chat/ThreadAutomationsPanel.permissions.test.tsx",
  "src/components/chat/ThreadDetailsPrRow.test.tsx",
  "src/components/chat/ThreadDetailsPrRows.test.tsx",
  "src/components/chat/ThreadFindProvider.test.tsx",
  "src/components/chat/ThreadRelationshipsControl.agents.test.tsx",
  "src/components/chat/useThreadFind.test.tsx",
  "src/components/ChatMarkdown.assets.test.tsx",
  "src/components/ChatMarkdown.permissions.test.tsx",
  "src/components/ChatMarkdown.test.tsx",
  "src/components/cloud/CloudEnvironmentConnectList.test.tsx",
  "src/components/device/DeviceStreamView.test.tsx",
  "src/components/device/useDeviceControls.test.tsx",
  "src/components/diffs/DiffFileTree.test.tsx",
  "src/components/diffs/StyledDiffCodeView.test.tsx",
  "src/components/files/AttachmentFilePreview.test.tsx",
  "src/components/files/useFileSaveCoordinator.test.tsx",
  "src/components/KeybindingsConfigWarning.test.tsx",
  "src/components/onboarding/WelcomeWizard.import.test.tsx",
  "src/components/onboarding/WelcomeWizard.terminal.test.tsx",
  "src/components/PermissionUpdateNotice.test.tsx",
  "src/components/preview/PreviewAutomationHosts.test.tsx",
  "src/components/preview/PreviewFaviconIcon.test.tsx",
  "src/components/projectScriptEditor.permissions.test.tsx",
  "src/components/projectScriptEditor.test.tsx",
  "src/components/pullRequest/PullRequestDetailPanel.test.tsx",
  "src/components/pullRequest/PullRequestMarkdownEditor.test.tsx",
  "src/components/pullRequest/PullRequestSummaryTab.test.tsx",
  "src/components/pullRequest/usePullRequestFilesViewed.test.tsx",
  "src/components/ReopenClosedViewShortcut.test.tsx",
  "src/components/search/ProjectContentSearchDialog.test.tsx",
  "src/components/ServerUpdateAction.test.tsx",
  "src/components/settings/colorPickers.test.tsx",
  "src/components/settings/IntegrationsSettings.test.tsx",
  "src/components/settings/ProjectSettingsPanel.test.tsx",
  "src/components/settings/SourceControlWritingSettings.test.tsx",
  "src/components/Sidebar.pointer.test.ts",
  "src/components/ThreadNotificationCoordinator.badge.test.tsx",
  "src/components/ThreadNotificationCoordinator.test.tsx",
  "src/components/ThreadStatusIndicators.subscriptions.test.tsx",
  "src/components/ThreadTerminalDrawer.permissions.test.tsx",
  "src/components/usage/UsagePage.refresh.test.tsx",
  "src/hooks/useActiveThreadRef.test.tsx",
  "src/hooks/useEnvironmentDisconnectDelay.test.tsx",
  "src/hooks/useLiveRefresh.test.ts",
  "src/hooks/useLongPress.test.ts",
  "src/hooks/usePullRequestChecksRefresh.test.ts",
  "src/hooks/useResizableWidth.test.tsx",
  "src/hooks/useSettings.sync.test.tsx",
  "src/panelAnimations.test.tsx",
  "src/state/queries.threadSearch.test.tsx",
  "src/state/usage.test.tsx",
];
