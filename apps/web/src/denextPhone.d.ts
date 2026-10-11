// Types for the denext module only the phone exports import (the `.mobile` platform files:
// components/ChatRouteContent.mobile.tsx). The denext export resolves `denext/navigation` to the
// real module through deno.json's import map; tsc resolves through node_modules, where denext has
// no package, so it reads these. They declare the subset the app uses, in React's types, and must
// stay in step with denext's src/navigation/history-stack.ts, history-source.ts and
// stack-layout.ts (denext ≥ 3.4.1, where HistoryStack first ships).

declare module "denext/navigation" {
  import type { ReactElement, ReactNode } from "react";

  /** What a screen renders from: the location it was pushed at, matched against its path. */
  export interface ScreenMatch {
    readonly path: string;
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly href: string;
    readonly params: Readonly<Record<string, string>>;
  }

  export interface ScreenOptions {
    readonly title?: string;
    readonly headerShown?: boolean;
    readonly gestureEnabled?: boolean;
    readonly fullScreenGestureEnabled?: boolean;
  }

  export interface HistoryScreen {
    readonly path: string;
    readonly render: (match: ScreenMatch) => ReactNode;
    readonly options?: ScreenOptions | ((match: ScreenMatch) => ScreenOptions);
  }

  export interface HistoryLocation {
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
    readonly index?: number | undefined;
  }

  export interface HistorySource {
    location(): HistoryLocation;
    subscribe(listener: () => void): () => void;
    push(href: string): void;
    replace(href: string): void;
    go(delta: number): void;
  }

  export interface HistoryStackProps {
    readonly history: HistorySource;
    readonly screens: readonly HistoryScreen[];
    readonly base?: string;
    readonly maxDepth?: number;
    readonly screenOptions?: ScreenOptions;
    readonly getKey?: (href: string) => string;
    readonly swipeBack?: boolean;
    readonly fullScreenSwipe?: boolean;
    readonly swipeHaptic?: boolean;
    readonly style?: Readonly<Record<string, string | number | undefined>>;
    readonly className?: string;
  }

  export function HistoryStack(props: HistoryStackProps): ReactElement;

  /** A TanStack Router (or its `router.history`) as a history source. */
  export function tanstackHistory(router: {
    readonly history: object;
    navigate(options: { href: string; replace?: boolean }): unknown;
  }): HistorySource;

  export interface StackNavigation {
    push(href: string): void;
    replace(href: string): void;
    pop(count?: number): void;
    popToTop(): void;
    readonly canGoBack: boolean;
    setOptions(options: ScreenOptions): void;
    readonly index: number;
  }

  export function useStackNavigation(): StackNavigation;
  export function useScreenMatch(): ScreenMatch | null;
}
