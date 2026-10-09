import * as React from "react";
import {
  useDeferredValue,
  useLayoutEffect,
  useRef,
  type ComponentType,
  type ReactNode,
  type ViewTransitionProps,
} from "react";

/**
 * Same-page `<ViewTransition>` with a no-op fallback.
 *
 * The denext build resolves `react` to denext, whose `ViewTransition` (3.4)
 * animates commits made of Transition work only: a `startTransition` update,
 * a `useDeferredValue` catch-up or a Suspense reveal. Urgent updates, including
 * every `useSyncExternalStore` store write, never animate. The Vite build runs
 * React 19.2, which has no stable `ViewTransition`, so there it renders its
 * children unchanged. Animation classes live in denext-theme.css and follow
 * the motion tokens (and `prefers-reduced-motion`).
 */
type ViewTransitionComponent = ComponentType<ViewTransitionProps>;

/** The runtime's ViewTransition component, or null when it has none. */
export function resolveViewTransition(react: object): ViewTransitionComponent | null {
  const candidates = react as {
    ViewTransition?: ViewTransitionComponent;
    unstable_ViewTransition?: ViewTransitionComponent;
  };
  return candidates.ViewTransition ?? candidates.unstable_ViewTransition ?? null;
}

const RuntimeViewTransition = resolveViewTransition(React);

/** Whether `<MotionViewTransition>` animates in this build. */
export const viewTransitionAvailable = RuntimeViewTransition !== null;

/** View-transition classes defined in denext-theme.css. */
export const MOTION_CLASS = {
  enterRise: "dnx-enter-rise",
  exitFade: "dnx-exit-fade",
  crossfade: "dnx-crossfade",
  slideIn: "dnx-slide-in",
  slideOut: "dnx-slide-out",
} as const;

export function MotionViewTransition(props: ViewTransitionProps & { children: ReactNode }) {
  if (RuntimeViewTransition === null) return <>{props.children}</>;
  return <RuntimeViewTransition {...props} />;
}

/**
 * Swap `children` for a new `contentKey` in a Transition commit, so a
 * `<ViewTransition>` around it can animate the swap. T3's state lives in
 * external stores, whose updates are always urgent; the deferred key turns
 * the content swap into a `useDeferredValue` catch-up (Transition work) while
 * the urgent commit keeps the previous content on screen (nothing, on the
 * first render). Renders with an unchanged key pass `children` straight through.
 */
function useTransitionedContent(
  contentKey: string | null,
  children: ReactNode,
): { readonly key: string | null; readonly content: ReactNode } {
  // Starting from null makes the first content (the panel opening) a
  // Transition too. Without a ViewTransition runtime nothing is deferred.
  const deferredKey = useDeferredValue(contentKey, viewTransitionAvailable ? null : contentKey);
  const shownRef = useRef<{ key: string | null; children: ReactNode }>({
    key: contentKey,
    children,
  });
  const caughtUp = deferredKey === contentKey;
  useLayoutEffect(() => {
    if (caughtUp) shownRef.current = { key: contentKey, children };
  });
  if (caughtUp || !viewTransitionAvailable) return { key: contentKey, content: children };
  return shownRef.current.key === deferredKey
    ? { key: deferredKey, content: shownRef.current.children }
    : { key: null, content: null };
}

/**
 * Right-panel content: opening the panel or switching surfaces (files, diff,
 * terminal, preview…) slides the new content in and fades the old one out,
 * as Transition work. Each surface gets its own keyed boundary, so the swap is
 * an exit plus an enter. The panel frame's own open/close motion stays with
 * T3's usePanelPresence; this only animates what is inside it.
 */
export function RightPanelMotion(props: { surfaceKey: string | null; children: ReactNode }) {
  const shown = useTransitionedContent(props.surfaceKey, props.children);
  if (shown.content === null || shown.content === undefined) return null;
  if (!viewTransitionAvailable) return <>{shown.content}</>;
  // denext marks the boundary's single host child, so the content gets a box
  // of its own that keeps the surface slot's flex column layout.
  return (
    <MotionViewTransition
      key={shown.key ?? "content"}
      enter={MOTION_CLASS.slideIn}
      exit={MOTION_CLASS.exitFade}
      update="none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-right-panel-motion>
        {shown.content}
      </div>
    </MotionViewTransition>
  );
}
