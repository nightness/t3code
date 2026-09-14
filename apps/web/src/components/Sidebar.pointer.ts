import { useLayoutEffect, type PointerEvent as ReactPointerEvent } from "react";
import { type SensorProps } from "@dnd-kit/core";
import { getOwnerDocument, getWindow } from "@dnd-kit/utilities";

import { LONG_PRESS_DELAY_MS, LONG_PRESS_MOVE_TOLERANCE_PX } from "../hooks/useLongPress";

// Search unmounts the drag context while its owning Sidebar remains mounted.
export function SidebarDragLifecycle({ onUnmount }: { onUnmount: () => void }) {
  useLayoutEffect(() => onUnmount, [onUnmount]);
  return null;
}

type Options = {
  distance: number;
  onAttach: (sensor: SidebarPointerSensor) => void;
  onFinish: (started: boolean) => void;
  /** Runs when a touch drag starts, e.g. to close the menu the same hold opened. */
  onTouchDragStart?: () => void;
};

/** A sidebar gesture ends on release, cancellation, or loss of its window.
 * Own the listeners so unmounting the list can cancel the sensor too.
 *
 * Touch works like an iOS list: a row must rest for a long press before it can
 * drag (the same hold opens its context menu), and moving sooner is a scroll,
 * so the gesture yields to the browser. Once armed, touchmove is cancelled so
 * the list stops scrolling under the drag. Mouse and pen are unaffected. */
export class SidebarPointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler: ({ nativeEvent }: ReactPointerEvent) =>
        nativeEvent.isPrimary && nativeEvent.button === 0,
    },
  ];
  /** iOS Safari honors preventDefault() from a touchmove listener added mid-gesture
   * only if a non-passive one was registered before the touch began (dnd-kit's
   * TouchSensor does the same). Registered only where a coarse pointer exists. */
  static setup() {
    if (
      typeof window === "undefined" ||
      window.matchMedia?.("(any-pointer: coarse)").matches !== true
    )
      return undefined;
    const keepTouchMoveCancelable = () => {};
    window.addEventListener("touchmove", keepTouchMoveCancelable, { passive: false });
    return () => window.removeEventListener("touchmove", keepTouchMoveCancelable);
  }
  autoScrollEnabled = true;
  private phase: "pending" | "dragging" | "finished" = "pending";
  private readonly pointer: PointerEvent;
  private readonly document: Document;
  private readonly window: Window;
  private readonly touch: boolean;
  private touchArmed = false;
  private touchArmTimer: number | null = null;

  constructor(private readonly props: SensorProps<Options>) {
    this.pointer = props.event as PointerEvent;
    this.document = getOwnerDocument(this.pointer.target);
    this.window = getWindow(this.pointer.target);
    this.touch = this.pointer.pointerType === "touch";
    if (this.touch) {
      this.document.addEventListener("touchmove", this.touchMove, {
        passive: false,
        capture: true,
      });
      this.touchArmTimer = this.window.setTimeout(this.armTouch, LONG_PRESS_DELAY_MS);
    }
    this.document.addEventListener("pointermove", this.move, { passive: false, capture: true });
    this.document.addEventListener("pointerup", this.end, { capture: true });
    this.document.addEventListener("pointercancel", this.pointerCancel, { capture: true });
    this.document.addEventListener("keydown", this.keydown, { capture: true });
    this.document.addEventListener("visibilitychange", this.visibilityChange);
    this.window.addEventListener("blur", this.cancel);
    this.window.addEventListener("pagehide", this.cancel);
    this.window.addEventListener("resize", this.cancel);
    this.document.addEventListener("dragstart", this.preventDefault);
    this.document.addEventListener("contextmenu", this.preventDefault);
    props.options.onAttach(this);
    props.onPending(props.active, { distance: props.options.distance }, this.coordinates());
  }

  private coordinates = () => ({ x: this.pointer.clientX, y: this.pointer.clientY });
  private preventDefault = (event: Event) => event.preventDefault();
  private clearClickSuppression = () => {
    this.document.removeEventListener("click", this.suppressClick, { capture: true });
    this.document.removeEventListener("pointerdown", this.clearClickSuppression, { capture: true });
  };
  private suppressClick = (event: Event) => {
    event.stopPropagation();
    this.clearClickSuppression();
  };
  private clearSelection = () => this.document.getSelection()?.removeAllRanges();

  private move = (event: PointerEvent) => {
    if (this.phase === "finished" || event.pointerId !== this.pointer.pointerId) return;
    // A release outside the window can be missed. Never activate or continue
    // a drag when the initiating button is no longer held.
    if ((event.buttons & 1) === 0) return this.cancel();
    const coordinates = { x: event.clientX, y: event.clientY };
    if (this.phase === "pending") {
      const offset = {
        x: event.clientX - this.pointer.clientX,
        y: event.clientY - this.pointer.clientY,
      };
      const travelled = Math.hypot(offset.x, offset.y);
      // A touch that moves before the hold arms it is a scroll: give it back.
      if (this.touch && !this.touchArmed && travelled > LONG_PRESS_MOVE_TOLERANCE_PX) {
        return this.cancel();
      }
      // An armed touch starts past the long-press tolerance, so a starting
      // drag has always cancelled a still-pending long press first.
      const threshold = this.touch
        ? Math.max(this.props.options.distance, LONG_PRESS_MOVE_TOLERANCE_PX)
        : this.props.options.distance;
      if ((this.touch && !this.touchArmed) || travelled <= threshold) {
        this.props.onPending(
          this.props.active,
          { distance: this.props.options.distance },
          this.coordinates(),
          offset,
        );
        return;
      }
      this.phase = "dragging";
      this.document.addEventListener("click", this.suppressClick, { capture: true });
      this.document.addEventListener("selectionchange", this.clearSelection);
      this.clearSelection();
      if (this.touch) this.props.options.onTouchDragStart?.();
      this.props.onStart(this.coordinates());
      return;
    }
    if (this.phase === "dragging") {
      if (event.cancelable) event.preventDefault();
      this.props.onMove(coordinates);
    }
  };

  private end = (event: PointerEvent) => {
    if (event.pointerId === this.pointer.pointerId) this.finish(false);
  };
  private pointerCancel = (event: PointerEvent) => {
    if (event.pointerId === this.pointer.pointerId) this.cancel();
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.code === "Escape") this.cancel();
  };
  private visibilityChange = () => {
    if (this.document.hidden) this.cancel();
  };
  private armTouch = () => {
    this.touchArmTimer = null;
    this.touchArmed = true;
  };
  private touchMove = (event: TouchEvent) => {
    if (this.touchArmed && this.phase !== "finished" && event.cancelable) event.preventDefault();
  };
  cancel = () => this.finish(true);

  private finish(cancelled: boolean) {
    if (this.phase === "finished") return;
    const aborted = this.phase === "pending";
    this.phase = "finished";
    if (this.touch) {
      if (this.touchArmTimer !== null) this.window.clearTimeout(this.touchArmTimer);
      this.touchArmTimer = null;
      this.document.removeEventListener("touchmove", this.touchMove, { capture: true });
    }
    this.document.removeEventListener("pointermove", this.move, { capture: true });
    this.document.removeEventListener("pointerup", this.end, { capture: true });
    this.document.removeEventListener("pointercancel", this.pointerCancel, { capture: true });
    this.document.removeEventListener("keydown", this.keydown, { capture: true });
    this.document.removeEventListener("visibilitychange", this.visibilityChange);
    this.window.removeEventListener("blur", this.cancel);
    this.window.removeEventListener("pagehide", this.cancel);
    this.window.removeEventListener("resize", this.cancel);
    this.document.removeEventListener("dragstart", this.preventDefault);
    this.document.removeEventListener("contextmenu", this.preventDefault);
    this.document.removeEventListener("selectionchange", this.clearSelection);
    // Cancellation can precede release by an arbitrary amount of time. Consume
    // that release click, or let a fresh pointerdown end suppression if release
    // happened outside the document. Ordinary clicks never install this guard.
    if (!aborted) {
      this.document.addEventListener("pointerdown", this.clearClickSuppression, { capture: true });
    }
    try {
      // Release the sidebar preview before dnd-kit clears its transforms.
      // Its public end/cancel event can be omitted before its first layout.
      this.props.options.onFinish(!aborted);
    } finally {
      if (aborted) this.props.onAbort(this.props.active);
      if (cancelled) this.props.onCancel();
      else this.props.onEnd();
    }
  }
}
