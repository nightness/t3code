// The iOS and Android exports' variant of ./ChatRouteContent.tsx (denext's platform files): on a
// phone-sized window the `_chat` routes become apps/mobile's native stack. Home is the thread
// list (the screen the drawer showed), a thread or draft pushes over it with the platform
// animation, and the back swipe (from anywhere on the screen on iOS), the back button in the
// header's leading slot or Android's back pops to it, with the list kept mounted below and its
// scroll position intact. denext's HistoryStack owns the animation and the gesture; TanStack
// Router keeps owning the URL. A wider window (an iPad) keeps the split layout.
import { Outlet, useRouter } from "@tanstack/react-router";
import { tanstackHistory, useStackNavigation, type HistoryScreen } from "denext/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useLegacySidebarEnabled } from "../hooks/useSettings";
import { resolveThreadRouteTarget, type ThreadRouteTarget } from "../threadRoutes";
import LegacyThreadSidebar from "./LegacySidebar";
import { PHONE_STACK_PATHS, phoneStackKey } from "./phoneStack.logic";
import { PhoneStackView } from "./phoneStackView";
import { PhoneHomeChromeContext } from "./sidebar/phoneHomeChrome";
import ThreadSidebar from "./Sidebar";
import { ThreadRouteView } from "./ThreadRouteView";
import { Button } from "./ui/button";
import { Sidebar, useSidebar } from "./ui/sidebar";

export function ChatRouteContent(props: {
  readonly threadTarget: ThreadRouteTarget | null;
}): ReactNode {
  const { isMobile } = useSidebar();
  if (!isMobile) {
    return props.threadTarget ? <ThreadRouteView target={props.threadTarget} /> : <Outlet />;
  }
  return <PhoneStack />;
}

/** The thread list as a full screen: the drawer's content, inline. */
function PhoneHome() {
  const legacySidebarEnabled = useLegacySidebarEnabled();
  return (
    <Sidebar
      side="left"
      collapsible="none"
      data-app-sidebar=""
      data-phone-home=""
      role="navigation"
      aria-label="Threads"
      className="h-full w-full"
    >
      {/* Inside the surface, as the drawer pads its content, so the safe areas keep its colour. */}
      <div className="flex h-full min-h-0 w-full flex-col pt-safe pr-safe pb-safe pl-safe">
        {/* Its header is apps/mobile's Home header: no drawer toggle, settings at the end. */}
        <PhoneHomeChromeContext value>
          {legacySidebarEnabled ? <LegacyThreadSidebar /> : <ThreadSidebar />}
        </PhoneHomeChromeContext>
      </div>
    </Sidebar>
  );
}

/** The header's back button, in the slot the drawer toggle has on the web build. */
function PhoneBackButton() {
  const navigation = useStackNavigation();
  if (!navigation.canGoBack) return null;
  return (
    <div className="pointer-events-none fixed left-[var(--workspace-controls-left)] top-[var(--workspace-controls-top)] z-50 ml-px flex h-[var(--workspace-topbar-height)] items-center">
      <Button
        aria-label="Back"
        className="pointer-events-auto size-[var(--workspace-titlebar-control-size)]!"
        onClick={() => navigation.pop()}
        size="icon"
        variant="ghost"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
    </div>
  );
}

function PhoneThread(props: { readonly target: ThreadRouteTarget | null }) {
  if (!props.target) return null;
  return (
    <>
      <ThreadRouteView target={props.target} />
      <PhoneBackButton />
    </>
  );
}

const renderThread = (match: { readonly params: Readonly<Record<string, string>> }) => (
  <PhoneThread target={resolveThreadRouteTarget(match.params)} />
);

const SCREENS: readonly HistoryScreen[] = [
  { path: PHONE_STACK_PATHS.home, render: () => <PhoneHome /> },
  // A leaf route of the layout: its own component, as the web layout's <Outlet /> shows it.
  { path: PHONE_STACK_PATHS.pullRequests, render: () => <Outlet /> },
  // Before the thread pattern, which would also match /draft/<id>.
  { path: PHONE_STACK_PATHS.draft, render: renderThread },
  { path: PHONE_STACK_PATHS.thread, render: renderThread },
];

function PhoneStack() {
  const router = useRouter();
  const history = useMemo(() => tanstackHistory(router), [router]);
  return <PhoneStackView history={history} screens={SCREENS} getKey={phoneStackKey} />;
}
