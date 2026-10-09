import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { ThreadRouteTarget } from "../threadRoutes";
import { ThreadRouteView } from "./ThreadRouteView";

/**
 * What the `_chat` layout shows: the thread routes render here, not in their own leaf
 * components, so the draft-to-thread promotion keeps one ChatView mounted across the swap. The
 * iOS and Android exports resolve ./ChatRouteContent.mobile.tsx (denext's platform files), the
 * phone stack.
 */
export function ChatRouteContent(props: {
  readonly threadTarget: ThreadRouteTarget | null;
}): ReactNode {
  return props.threadTarget ? <ThreadRouteView target={props.threadTarget} /> : <Outlet />;
}
