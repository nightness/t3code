// The iOS and Android exports' variant of ./phoneSettings.tsx (denext's platform files). On a
// phone-sized window Settings is apps/mobile's settings stack (Stack.tsx: SettingsSheet →
// SettingsContentStack): the "Settings" list of sections with a close button that returns to the
// app, and each section pushed over it with a back button in the header, the platform animation
// and the back swipe. denext's HistoryStack runs it over the `/settings` routes; TanStack Router
// keeps owning the URL, and a link straight to a section stacks the list underneath it. A wider
// window (an iPad) keeps the sidebar nav, as apps/mobile's split view does.
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { tanstackHistory, type HistoryScreen } from "denext/navigation";
import { ChartNoAxesColumnIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useIsMobile } from "../../hooks/useMediaQuery";
import { usePullRequestsSupported } from "../../state/environments";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { PhoneStackView } from "../phoneStackView";
import { useNavigateToMainApp } from "../sidebar/mainAppLocation";
import { Button } from "../ui/button";
import type { PhoneSettingsLayoutProps } from "./phoneSettings";
import { settingsBreadcrumbLabel } from "./SettingsBreadcrumb";
import { SETTINGS_NAV_ITEMS } from "./SettingsSidebarNav";
import { isSettingsOverviewVisible } from "./settingsSearch";
import { validateSettingsScopeSearch } from "./settingsScope";

export type { PhoneSettingsLayoutProps } from "./phoneSettings";

/**
 * The stack's header as apps/mobile's settings header draws it (Stack.tsx GLASS_HEADER_OPTIONS):
 * on the screen's own colour with no hairline (headerShadowVisible: false), the controls in the
 * icon colour rather than a link tint, and the title at 18 px, weight 800 (DM Sans's heaviest,
 * 700, renders it).
 */
const SETTINGS_HEADER_STYLE = {
  "--dnx-header-bg": "var(--background)",
  "--dnx-header-fg": "var(--foreground)",
  "--dnx-header-tint": "var(--foreground)",
  "--dnx-header-border": "none",
  "--dnx-header-title-size": "18px",
  "--dnx-header-title-weight": "800",
} as const;

/** The drawer breakpoint (hooks/useMediaQuery.ts `max-md`). */
const PHONE_QUERY = "(max-width: 767px)";

export function usePhoneSettings(): boolean {
  return useIsMobile();
}

/** On a phone `/settings` is the list of sections, as apps/mobile's Settings screen. */
export function shouldRedirectSettingsIndex(): boolean {
  return typeof window === "undefined" || !window.matchMedia?.(PHONE_QUERY).matches;
}

/** apps/mobile's Settings header: "Settings", closed from the leading edge back to the app. */
function CloseSettingsButton() {
  const navigateToMainApp = useNavigateToMainApp();
  return (
    <Button
      aria-label="Close settings"
      size="icon"
      variant="ghost"
      onClick={() => void navigateToMainApp()}
    >
      <XIcon className="size-4" />
    </Button>
  );
}

/**
 * apps/mobile's Settings list (features/settings/SettingsRouteScreen.tsx): one grouped card
 * (SettingsSection: rounded-[24px] bg-grouped-card, which is zinc-100 in light as web's
 * --accent) of rows (SettingsRow: p-4 gap-4, a 22 px icon, the label in text-lg, a 16 px
 * chevron), in a px-5 pt-4 scroll view.
 */
export function PhoneSettingsList() {
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => location.search });
  const showOverview = isSettingsOverviewVisible(validateSettingsScopeSearch(search));
  const items = SETTINGS_NAV_ITEMS.filter(
    (item) => item.to !== "/settings/projects" || showOverview,
  );
  const pullRequestsSupported = usePullRequestsSupported();
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-background px-5 pt-4 pb-safe">
      <ul aria-label="Settings sections" className="shrink-0 overflow-hidden rounded-3xl bg-accent">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <button
                type="button"
                className="flex w-full items-center gap-4 p-4 text-left active:bg-foreground/5"
                onClick={() => void navigate({ to: item.to })}
              >
                <Icon className="size-5.5 shrink-0 text-foreground" />
                <span className="min-w-0 flex-1 truncate text-lg text-foreground">
                  {item.label}
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      {/* apps/mobile's "App" section (SettingsRouteScreen: Usage). The phone Home has no
          utility row, so Pull Requests, which apps/mobile lacks, is reached from here too. */}
      <section aria-labelledby="phone-settings-app" className="flex shrink-0 flex-col gap-2">
        <h2 id="phone-settings-app" className="px-2 text-sm font-medium text-muted-foreground">
          App
        </h2>
        <ul className="overflow-hidden rounded-3xl bg-accent">
          <li>
            <PhoneSettingsRow
              icon={<ChartNoAxesColumnIcon className="size-5.5 shrink-0 text-foreground" />}
              label="Usage"
              onPress={() => void navigate({ to: "/usage" })}
            />
          </li>
          {pullRequestsSupported ? (
            <li>
              <PhoneSettingsRow
                icon={
                  <PullRequestGlyph.pullRequest className="size-5.5 shrink-0 text-foreground" />
                }
                label="Pull Requests"
                onPress={() =>
                  void navigate({ to: "/pull-requests", search: readPullRequestListPreferences() })
                }
              />
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

/** apps/mobile's SettingsRow: the icon, the label in text-lg, a chevron. */
function PhoneSettingsRow(props: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-4 p-4 text-left active:bg-foreground/5"
      onClick={props.onPress}
    >
      {props.icon}
      <span className="min-w-0 flex-1 truncate text-lg text-foreground">{props.label}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function PhoneSettingsLayout(props: PhoneSettingsLayoutProps): ReactNode {
  const router = useRouter();
  const history = useMemo(() => tanstackHistory(router), [router]);
  const screens = useMemo<readonly HistoryScreen[]>(
    () => [
      {
        path: "/settings",
        render: () => <PhoneSettingsList />,
        options: { title: "Settings", headerShown: true, headerLeft: <CloseSettingsButton /> },
      },
      {
        path: "/settings/$section",
        // The page is the screen's one scroller (the settings page scrolls itself), under the header.
        render: () => (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">{props.page}</div>
        ),
        options: (match) => ({
          title: settingsBreadcrumbLabel(match.pathname) ?? "Settings",
          headerShown: true,
          ...(match.pathname === "/settings/general" ? { headerRight: props.generalAction } : {}),
        }),
      },
    ],
    [props.page, props.generalAction],
  );
  return (
    <PhoneStackView
      history={history}
      screens={screens}
      base="/settings"
      style={SETTINGS_HEADER_STYLE}
    />
  );
}
