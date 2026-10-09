import { describe, expect, it } from "vite-plus/test";

import { SIDEBAR_THREAD_HOVER_CARD_TIMING } from "./Sidebar.logic";

describe("SIDEBAR_THREAD_HOVER_CARD_TIMING", () => {
  it("opens a thread details card only when the pointer rests on a row", () => {
    expect(SIDEBAR_THREAD_HOVER_CARD_TIMING.delay).toBeGreaterThanOrEqual(600);
  });

  it("has no warm-up window, so sweeping across rows never chains cards open", () => {
    expect(SIDEBAR_THREAD_HOVER_CARD_TIMING.timeout).toBe(0);
    expect(SIDEBAR_THREAD_HOVER_CARD_TIMING.closeDelay).toBe(0);
  });
});
