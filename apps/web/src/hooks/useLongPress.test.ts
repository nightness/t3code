import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  beginLongPress,
  cancelLongPress,
  LONG_PRESS_DELAY_MS,
  useLongPress,
  type LongPressProps,
} from "./useLongPress";

class TestMouseEvent extends Event {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  constructor(type: string, init: MouseEventInit) {
    super(type, init);
    this.button = init.button ?? 0;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
  }
}

class TestElement extends EventTarget {
  isConnected = true;
  constructor(readonly ownerDocument: { defaultView: EventTarget }) {
    super();
  }
}

let view: EventTarget;
let element: TestElement;
let contextMenus: TestMouseEvent[];
let preventContextMenu: boolean;

function pointer(type: string, values: Partial<PointerEvent> = {}) {
  return Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    clientX: 40,
    clientY: 60,
    screenX: 40,
    screenY: 60,
    ...values,
  });
}

/** Dispatches a touch pointerdown on `target` so the long press sees a real event target. */
function press(target: TestElement = element, values: Partial<PointerEvent> = {}) {
  const down = pointer("pointerdown", values);
  target.addEventListener("pointerdown", (event) => beginLongPress(event as PointerEvent), {
    once: true,
  });
  target.dispatchEvent(down);
  return down;
}

function click() {
  const event = new Event("click", { cancelable: true });
  view.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  view = Object.assign(new EventTarget(), {
    setTimeout,
    clearTimeout,
    MouseEvent: TestMouseEvent,
  });
  element = new TestElement({ defaultView: view });
  contextMenus = [];
  preventContextMenu = true;
  element.addEventListener("contextmenu", (event) => {
    contextMenus.push(event as TestMouseEvent);
    if (preventContextMenu) event.preventDefault();
  });
});

afterEach(() => {
  cancelLongPress();
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("long press", () => {
  it("dispatches contextmenu at the touch point after the delay and swallows the release click", () => {
    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS - 1);
    expect(contextMenus).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(contextMenus).toHaveLength(1);
    expect(contextMenus[0]).toMatchObject({ button: 2, clientX: 40, clientY: 60, bubbles: true });

    view.dispatchEvent(pointer("pointerup"));
    const release = click();
    expect(release.defaultPrevented).toBe(true);
    // Only the release click: the next tap goes through.
    expect(click().defaultPrevented).toBe(false);
  });

  it.each(["mouse", "pen"])("ignores %s input", (pointerType) => {
    press(element, { pointerType });
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS * 2);
    expect(contextMenus).toHaveLength(0);
    expect(click().defaultPrevented).toBe(false);
  });

  it("tolerates jitter, reports the latest point, and cancels once the finger travels", () => {
    press();
    view.dispatchEvent(pointer("pointermove", { clientX: 46, clientY: 66 }));
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(1);
    expect(contextMenus[0]).toMatchObject({ clientX: 46, clientY: 66 });

    view.dispatchEvent(pointer("pointerup"));
    click();
    press();
    view.dispatchEvent(pointer("pointermove", { clientY: 71 }));
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(1);
  });

  const interruptions: Record<string, () => void> = {
    release: () => view.dispatchEvent(pointer("pointerup")),
    pointercancel: () => view.dispatchEvent(pointer("pointercancel")),
    scroll: () => view.dispatchEvent(new Event("scroll")),
    "a second finger": () => view.dispatchEvent(pointer("pointerdown", { pointerId: 2 })),
    blur: () => view.dispatchEvent(new Event("blur")),
  };
  for (const [name, interrupt] of Object.entries(interruptions)) {
    it(`cancels on ${name} before the delay`, () => {
      press();
      interrupt();
      vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
      expect(contextMenus).toHaveLength(0);
      expect(click().defaultPrevented).toBe(false);
    });
  }

  it("ignores events from other pointers while pending", () => {
    press();
    view.dispatchEvent(pointer("pointermove", { pointerId: 2, clientY: 400 }));
    view.dispatchEvent(pointer("pointerup", { pointerId: 2 }));
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(1);
  });

  it("keeps the release a tap when no handler claims the contextmenu", () => {
    preventContextMenu = false;
    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(1);
    view.dispatchEvent(pointer("pointerup"));
    expect(click().defaultPrevented).toBe(false);
  });

  it("yields to a native long-press contextmenu, and swallows one that follows ours", () => {
    press();
    const native = new Event("contextmenu", { cancelable: true });
    view.dispatchEvent(native);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(native.defaultPrevented).toBe(false);
    expect(contextMenus).toHaveLength(0);

    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    const late = new Event("contextmenu", { cancelable: true });
    const propagation = vi.spyOn(late, "stopImmediatePropagation");
    view.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);
    expect(propagation).toHaveBeenCalledOnce();
    expect(contextMenus).toHaveLength(1);
  });

  it("gives a touch in nested long-press elements to the innermost one", () => {
    const outer = vi.fn();
    element.addEventListener("pointerdown", (event) => {
      // The outer binding sees the same event after the inner one claimed it.
      beginLongPress(event as PointerEvent);
      outer();
    });
    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(outer).toHaveBeenCalledOnce();
    expect(contextMenus).toHaveLength(1);
  });

  it("skips an element that left the document during the press", () => {
    press();
    element.isConnected = false;
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(0);
  });

  it("stops swallowing clicks at the next touch or shortly after a click-less release", () => {
    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    view.dispatchEvent(pointer("pointerup"));
    view.dispatchEvent(pointer("pointerdown", { pointerId: 2 }));
    expect(click().defaultPrevented).toBe(false);

    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    view.dispatchEvent(pointer("pointerup"));
    vi.advanceTimersByTime(1000);
    expect(click().defaultPrevented).toBe(false);
  });

  it("keeps swallowing the release click however long the finger is held after firing", () => {
    press();
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS + 5000);
    view.dispatchEvent(pointer("pointerup"));
    expect(click().defaultPrevented).toBe(true);
  });
});

describe("useLongPress", () => {
  let renderer: ReactTestRenderer | undefined;
  let props: LongPressProps[];

  function Probe(options: { delayMs?: number }) {
    props.push(useLongPress(options));
    return null;
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    props = [];
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function bindAndPress(binding: LongPressProps) {
    element.addEventListener(
      "pointerdown",
      (event) => binding.onPointerDown({ nativeEvent: event } as never),
      { once: true },
    );
    element.dispatchEvent(pointer("pointerdown"));
  }

  it("returns stable props that mark the element and start a press", () => {
    act(() => {
      renderer = create(createElement(Probe, {}));
    });
    act(() => renderer?.update(createElement(Probe, {})));
    expect(props[0]).toBe(props[1]);
    expect(props[0]?.["data-long-press"]).toBe("");

    bindAndPress(props[0]!);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(1);
  });

  it("honors a custom delay", () => {
    act(() => {
      renderer = create(createElement(Probe, { delayMs: 800 }));
    });
    bindAndPress(props.at(-1)!);
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(contextMenus).toHaveLength(1);
  });

  it("cancels its own pending press when the component unmounts", () => {
    act(() => {
      renderer = create(createElement(Probe, {}));
    });
    bindAndPress(props[0]!);
    act(() => renderer?.unmount());
    renderer = undefined;
    vi.advanceTimersByTime(LONG_PRESS_DELAY_MS);
    expect(contextMenus).toHaveLength(0);
  });
});
