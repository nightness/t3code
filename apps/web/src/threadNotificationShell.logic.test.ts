import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  mutedThreadNotificationIds,
  newlyMuted,
  parseThreadNotificationData,
  THREAD_NOTIFICATION_CATEGORIES,
  THREAD_NOTIFICATION_CATEGORY,
  threadNotificationData,
  threadNotificationThreadId,
} from "./threadNotificationShell.logic";

const env = "env-1" as EnvironmentId;
const thread = (id: string, mutedAt: string | null = null) => ({
  environmentId: env,
  id: id as ThreadId,
  mutedAt,
});

describe("threadNotificationThreadId", () => {
  it("matches the relay's APNs thread-id", () => {
    expect(threadNotificationThreadId({ environmentId: env, threadId: "t-1" as ThreadId })).toBe(
      "env-1/t-1",
    );
  });
});

describe("thread alert payload", () => {
  it("round-trips a thread", () => {
    const ref = { environmentId: env, threadId: "t-1" as ThreadId };
    expect(parseThreadNotificationData(threadNotificationData(ref))).toEqual(ref);
  });

  it("rejects payloads that do not name one thread", () => {
    expect(parseThreadNotificationData(null)).toBeNull();
    expect(parseThreadNotificationData("env-1/t-1")).toBeNull();
    expect(parseThreadNotificationData({ environmentId: "env-1" })).toBeNull();
    expect(parseThreadNotificationData({ environmentId: "", threadId: "t-1" })).toBeNull();
    expect(parseThreadNotificationData({ environmentId: "env-1", threadId: 7 })).toBeNull();
    expect(parseThreadNotificationData({ environmentId: "env/1", threadId: "t-1" })).toBeNull();
    expect(
      parseThreadNotificationData({ environmentId: "env-1", threadId: "t".repeat(257) }),
    ).toBeNull();
  });
});

describe("muted threads", () => {
  it("collects the muted threads' notification ids", () => {
    expect(
      mutedThreadNotificationIds([thread("a", "2026-10-09T10:00:00.000Z"), thread("b")]),
    ).toEqual(new Set(["env-1/a"]));
  });

  it("reports only the threads muted since the last look", () => {
    expect(newlyMuted(new Set(["env-1/a"]), new Set(["env-1/a", "env-1/b"]))).toEqual(["env-1/b"]);
    expect(newlyMuted(new Set(["env-1/a"]), new Set())).toEqual([]);
  });
});

describe("THREAD_NOTIFICATION_CATEGORIES", () => {
  it("offers #16800's mute as the alert's button", () => {
    expect(THREAD_NOTIFICATION_CATEGORIES).toEqual([
      {
        id: THREAD_NOTIFICATION_CATEGORY,
        actions: [{ id: "mute", title: "Mute notifications" }],
      },
    ]);
  });
});
