// Types for the denext modules only the phone exports import (the `.mobile` platform files:
// components/ChatRouteContent.mobile.tsx, components/sidebar/ThreadRowSwipe.mobile.tsx,
// components/settings/phoneSettings.mobile.tsx, components/sidebar/PhoneNewTaskSheet.mobile.tsx). The
// denext export resolves `denext` and `denext/navigation` to the real modules through deno.json's
// import map; tsc resolves through node_modules, where denext has no package, so it reads these.
// They declare the subset the app uses, in React's types, and must stay in step with denext's
// src/navigation/history-stack.ts, history-source.ts, stack-layout.ts, types.ts, sheet.ts and
// src/client/swipe-row/swipeable-row.ts (denext ≥ 3.4.1, where HistoryStack and SwipeableRow
// first ship).

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
    readonly headerBackTitle?: string;
    readonly headerBackVisible?: boolean;
    readonly headerLeft?: ReactNode;
    readonly headerRight?: ReactNode;
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

  /** A sheet's resting heights: a named detent, a fraction of the available height, or px. */
  export type SheetDetent = "medium" | "large" | "fit" | number;

  export interface SheetProps {
    readonly open: boolean;
    readonly onOpenChange?: (open: boolean) => void;
    readonly onExitComplete?: () => void;
    readonly detents?: readonly SheetDetent[];
    readonly initialDetent?: number;
    readonly grabber?: boolean;
    readonly dismissible?: boolean;
    readonly backdrop?: boolean;
    readonly "aria-label"?: string;
    readonly style?: Readonly<Record<string, string | number | undefined>>;
    readonly children?: ReactNode;
  }

  /** A bottom sheet with detents, a grabber, drag to dismiss and a focus trap. */
  export function Sheet(props: SheetProps): ReactElement | null;
  export function useScreenMatch(): ScreenMatch | null;
}

declare module "denext" {
  import type { ReactElement, ReactNode } from "react";

  export interface SwipeAction {
    readonly label: string;
    readonly onPress: () => void;
    readonly icon?: ReactNode;
    readonly tone?: "neutral" | "accent" | "destructive" | "warning" | "success";
    readonly background?: string;
    readonly color?: string;
    readonly accessibilityLabel?: string;
    readonly key?: string;
  }

  export type SwipeableRowSide = "leading" | "trailing";

  export interface SwipeableRowProps {
    readonly children?: ReactNode;
    readonly leading?: readonly SwipeAction[];
    readonly trailing?: readonly SwipeAction[];
    readonly fullSwipe?: boolean | SwipeableRowSide;
    readonly fullSwipeThreshold?: number;
    readonly actionWidth?: number;
    readonly haptics?: boolean;
    readonly closeOnAction?: boolean;
    readonly disabled?: boolean;
    readonly onOpenChange?: (side: SwipeableRowSide | null) => void;
    readonly as?: "div" | "li";
    readonly className?: string;
    readonly style?: Readonly<Record<string, string | number | undefined>>;
    readonly contentStyle?: Readonly<Record<string, string | number | undefined>>;
  }

  export function SwipeableRow(props: SwipeableRowProps): ReactElement;
}
