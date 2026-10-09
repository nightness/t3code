import { describe, expect, it } from "vite-plus/test";

import { PHONE_THREAD_SCREEN_KEY, phoneStackKey } from "./phoneStack.logic";

describe("phoneStackKey", () => {
  it("keys Home and Pull requests by their path", () => {
    expect(phoneStackKey("/")).toBe("/");
    expect(phoneStackKey("/pull-requests")).toBe("/pull-requests");
    expect(phoneStackKey("/pull-requests/")).toBe("/pull-requests");
  });

  it("ignores the query and the fragment", () => {
    expect(phoneStackKey("/?q=fix")).toBe("/");
    expect(phoneStackKey("/pull-requests?state=open#top")).toBe("/pull-requests");
  });

  it("gives every thread and draft route the one thread screen", () => {
    expect(phoneStackKey("/env-1/thread-1")).toBe(PHONE_THREAD_SCREEN_KEY);
    expect(phoneStackKey("/env-1/thread-2?panel=diff")).toBe(PHONE_THREAD_SCREEN_KEY);
    expect(phoneStackKey("/draft/draft-1")).toBe(PHONE_THREAD_SCREEN_KEY);
  });

  it("keeps a draft's promotion onto its thread route on the same screen", () => {
    expect(phoneStackKey("/draft/draft-1")).toBe(phoneStackKey("/env-1/thread-1"));
  });
});
