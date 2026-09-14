import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

/** How long a touch must rest before it counts as a long press (iOS uses about the same). */
export const LONG_PRESS_DELAY_MS = 500;
/** Movement past this while pending means the finger is scrolling or dragging, not pressing. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/** A long press swallows its release click; one that never arrives must not eat a later tap. */
const CLICK_SUPPRESSION_TIMEOUT_MS = 800;

export interface LongPressOptions {
  readonly delayMs?: number;
  readonly moveTolerancePx?: number;
}

export interface LongPressProps {
  /** Styled in index.css: no iOS callout or text selection under a coarse pointer. */
  readonly "data-long-press": "";
  readonly onPointerDown: (event: ReactPointerEvent<Element>) => void;
}

interface Press {
  readonly owner: object | undefined;
  readonly pointerId: number;
  readonly target: Element;
  readonly view: Window;
  readonly originX: number;
  readonly originY: number;
  readonly tolerance: number;
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  timer: number | null;
  fired: boolean;
}

interface ClickSuppression {
  readonly end: () => void;
  readonly startTimeout: () => void;
}

// One finger presses at a time, so the gesture state is shared by every
// element: a hook instance can bind any number of elements (list rows).
let activePress: Press | null = null;
let clickSuppression: ClickSuppression | null = null;
let dispatchingEvent: Event | null = null;
// A touch inside nested long-press elements belongs to the innermost one; its
// contextmenu still bubbles to the outer handlers, as a right-click would.
const claimedEvents = new WeakSet<Event>();

function isElement(target: EventTarget | null): target is Element {
  return typeof target === "object" && target !== null && "ownerDocument" in target;
}

/**
 * Starts a long press for a touch `pointerdown`. After `delayMs` of the finger
 * resting within `moveTolerancePx`, dispatches a `contextmenu` MouseEvent at
 * the touch point on the touched element, so the element's existing
 * `onContextMenu` handler runs unchanged: WKWebView never fires `contextmenu`
 * for a long press. When a handler prevents that event's default (it opened a
 * menu), the release click is swallowed. Mouse and pen input is ignored, so
 * right-click behaves exactly as before.
 */
export function beginLongPress(
  event: PointerEvent,
  options: LongPressOptions & { readonly owner?: object } = {},
): void {
  if (event.pointerType !== "touch" || claimedEvents.has(event)) return;
  claimedEvents.add(event);
  cancelLongPress();
  // A second finger is a pinch or a two-finger scroll, not a press.
  if (!event.isPrimary) return;
  const target = event.target;
  if (!isElement(target)) return;
  const view = target.ownerDocument?.defaultView;
  if (!view) return;
  const press: Press = {
    owner: options.owner,
    pointerId: event.pointerId,
    target,
    view,
    originX: event.clientX,
    originY: event.clientY,
    tolerance: options.moveTolerancePx ?? LONG_PRESS_MOVE_TOLERANCE_PX,
    x: event.clientX,
    y: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    timer: null,
    fired: false,
  };
  press.timer = view.setTimeout(() => firePress(press), options.delayMs ?? LONG_PRESS_DELAY_MS);
  activePress = press;
  view.addEventListener("pointermove", onPointerMove, { capture: true });
  view.addEventListener("pointerup", onPointerEnd, { capture: true });
  view.addEventListener("pointercancel", onPointerEnd, { capture: true });
  view.addEventListener("pointerdown", onOtherPointerDown, { capture: true });
  view.addEventListener("scroll", onScroll, { capture: true, passive: true });
  view.addEventListener("contextmenu", onContextMenu, { capture: true });
  view.addEventListener("blur", onBlur);
}

/** Cancels the pending press, or only the one a hook instance started when `owner` is given. */
export function cancelLongPress(owner?: object): void {
  const press = activePress;
  if (!press || (owner !== undefined && press.owner !== owner)) return;
  detachPress(press);
}

function detachPress(press: Press): void {
  if (press.timer !== null) press.view.clearTimeout(press.timer);
  press.timer = null;
  if (activePress === press) activePress = null;
  const { view } = press;
  view.removeEventListener("pointermove", onPointerMove, { capture: true });
  view.removeEventListener("pointerup", onPointerEnd, { capture: true });
  view.removeEventListener("pointercancel", onPointerEnd, { capture: true });
  view.removeEventListener("pointerdown", onOtherPointerDown, { capture: true });
  view.removeEventListener("scroll", onScroll, { capture: true });
  view.removeEventListener("contextmenu", onContextMenu, { capture: true });
  view.removeEventListener("blur", onBlur);
}

function firePress(press: Press): void {
  press.timer = null;
  if (activePress !== press) return;
  if (!press.target.isConnected) {
    detachPress(press);
    return;
  }
  // The event's own realm, so handlers' instanceof checks hold in every frame.
  const { MouseEvent } = press.view as Window & typeof globalThis;
  const contextMenuEvent = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 2,
    clientX: press.x,
    clientY: press.y,
    screenX: press.screenX,
    screenY: press.screenY,
    view: press.view,
  });
  dispatchingEvent = contextMenuEvent;
  try {
    press.target.dispatchEvent(contextMenuEvent);
  } finally {
    dispatchingEvent = null;
  }
  // Nothing claimed the press (no menu here): the eventual release stays a tap.
  if (!contextMenuEvent.defaultPrevented) {
    detachPress(press);
    return;
  }
  press.fired = true;
  suppressNextClick(press.view);
}

function suppressNextClick(view: Window): void {
  clickSuppression?.end();
  let timer: number | null = null;
  const onClick = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    end();
  };
  const end = () => {
    view.removeEventListener("click", onClick, { capture: true });
    view.removeEventListener("pointerdown", end, { capture: true });
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    if (clickSuppression === suppression) clickSuppression = null;
  };
  const suppression: ClickSuppression = {
    end,
    startTimeout: () => {
      if (timer === null) timer = view.setTimeout(end, CLICK_SUPPRESSION_TIMEOUT_MS);
    },
  };
  clickSuppression = suppression;
  view.addEventListener("click", onClick, { capture: true });
  // A fresh touch ends it too, so a release that produced no click cannot
  // swallow the next real tap.
  view.addEventListener("pointerdown", end, { capture: true });
}

function onPointerMove(event: PointerEvent): void {
  const press = activePress;
  if (!press || press.fired || event.pointerId !== press.pointerId) return;
  press.x = event.clientX;
  press.y = event.clientY;
  press.screenX = event.screenX;
  press.screenY = event.screenY;
  if (Math.hypot(press.x - press.originX, press.y - press.originY) > press.tolerance) {
    detachPress(press);
  }
}

function onPointerEnd(event: PointerEvent): void {
  const press = activePress;
  if (!press || event.pointerId !== press.pointerId) return;
  detachPress(press);
  if (press.fired) clickSuppression?.startTimeout();
}

function onOtherPointerDown(event: PointerEvent): void {
  const press = activePress;
  if (press && event.pointerId !== press.pointerId) detachPress(press);
}

function onScroll(): void {
  const press = activePress;
  if (press && !press.fired) detachPress(press);
}

function onBlur(): void {
  if (activePress) detachPress(activePress);
}

function onContextMenu(event: Event): void {
  const press = activePress;
  if (!press || event === dispatchingEvent) return;
  if (press.fired) {
    // A browser that has its own long-press menu (Android Chrome) must not
    // open a second one after ours.
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  // The browser's own long-press contextmenu got there first; let it through.
  detachPress(press);
}

/**
 * Makes `onContextMenu` reachable by touch: spread the returned props on the
 * element that has the handler (or any element inside one). A long press runs
 * the handler with a real `contextmenu` event at the touch point. The props are
 * stable, carry no per-element state, and one hook call can bind every row of
 * a list. Touch only; mouse and pen input is untouched.
 */
export function useLongPress(options: LongPressOptions = {}): LongPressProps {
  const { delayMs = LONG_PRESS_DELAY_MS, moveTolerancePx = LONG_PRESS_MOVE_TOLERANCE_PX } = options;
  const [owner] = useState(() => ({}));
  useEffect(() => () => cancelLongPress(owner), [owner]);
  return useMemo(
    () => ({
      "data-long-press": "",
      onPointerDown: (event: ReactPointerEvent<Element>) =>
        beginLongPress(event.nativeEvent, { delayMs, moveTolerancePx, owner }),
    }),
    [delayMs, moveTolerancePx, owner],
  );
}
