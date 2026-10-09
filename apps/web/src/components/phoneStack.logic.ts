/**
 * The phone stack's screens (components/ChatRouteContent.mobile.tsx): apps/mobile's Home → Thread
 * navigation over the `_chat` routes. The paths are TanStack Router's, matched in order.
 */
export const PHONE_STACK_PATHS = {
  home: "/",
  pullRequests: "/pull-requests",
  draft: "/draft/$draftId",
  thread: "/$environmentId/$threadId",
} as const;

/** The stack key every thread screen shares (see {@link phoneStackKey}). */
export const PHONE_THREAD_SCREEN_KEY = "thread";

/**
 * Which screen a location is, for the stack. Every thread and draft route is ONE screen: opening
 * another thread from a thread (a link, the command palette, a notification) swaps the thread in
 * place, as the web layout does, and a draft's promotion onto its thread's route updates the
 * same screen, so the composer and the ChatView stay mounted across it (ThreadRouteView's
 * contract). It also keeps a single ChatView alive on the phone. Home and Pull requests key by
 * their path.
 */
export function phoneStackKey(href: string): string {
  const pathname = href.split(/[?#]/, 1)[0] || "/";
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === PHONE_STACK_PATHS.home || path === PHONE_STACK_PATHS.pullRequests
    ? path
    : PHONE_THREAD_SCREEN_KEY;
}
