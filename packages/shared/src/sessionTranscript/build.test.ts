import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { buildSessionTranscript, createSessionTranscriptId, truncateMiddle } from "./build.ts";
import { parseSessionTranscript, SESSION_TRANSCRIPT_ID_PATTERN } from "./document.ts";
import { FIXTURE_SECRETS, makeSessionTranscriptFixtureProjection } from "./testFixtures.ts";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";

function build(options: Partial<Parameters<typeof buildSessionTranscript>[0]> = {}) {
  return buildSessionTranscript({
    id: ID,
    projection: makeSessionTranscriptFixtureProjection(),
    exportedAt: DateTime.makeUnsafe("2026-10-09T11:00:00.000Z"),
    redaction: { homeDir: "/Users/dev", workspaceRoot: "/Users/dev/project" },
    ...options,
  });
}

describe("buildSessionTranscript", () => {
  it("summarises the thread: prompt, models, turns, tools and tokens", () => {
    const transcript = build();
    expect(transcript.title).toBe("Add a healthz route");
    expect(transcript.prompt).toBe("Add a /healthz route to the server and cover it with a test.");
    expect(transcript.provider).toBe("claudeAgent");
    expect(transcript.models).toEqual(["claude-sonnet-4-5", "claude-opus-4-1"]);
    expect(transcript.turns.map((turn) => turn.model)).toEqual([
      "claude-sonnet-4-5",
      "claude-opus-4-1",
    ]);
    expect(transcript.toolsUsed).toEqual([
      { name: "Shell", count: 4 },
      { name: "Edit", count: 3 },
      { name: "Read", count: 1 },
    ]);
    expect(transcript.totals).toMatchObject({
      turns: 2,
      toolCalls: 8,
      inputTokens: 110_100,
      cachedInputTokens: 78_500,
      outputTokens: 3_570,
      reasoningTokens: 640,
      costUsd: null,
      durationMs: 15 * 60_000 + 12_000,
    });
  });

  it("keeps the turn's user message as its header and the rest as entries, in order", () => {
    const [first, second] = build().turns;
    expect(first?.user?.text).toBe("Add a /healthz route to the server and cover it with a test.");
    expect(first?.entries.map((entry) => entry.kind)).toEqual([
      "reasoning",
      "command",
      "command",
      "command",
      "tool",
      "file_change",
      "file_change",
      "assistant",
    ]);
    expect(second?.entries.map((entry) => entry.kind)).toEqual([
      "command",
      "file_change",
      "assistant",
    ]);
    const failed = second?.entries[0];
    expect(failed).toMatchObject({ kind: "command", exitCode: 1, failed: true });
  });

  it("publishes none of the planted secrets", () => {
    const json = JSON.stringify(build());
    for (const secret of Object.values(FIXTURE_SECRETS)) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain("abcdefghijklmnop0123456789");
    // The user's home directory never appears either.
    expect(json).not.toContain("/Users/dev");
  });

  it("withholds the contents of private files and commands that read them", () => {
    const [first] = build().turns;
    const envChange = first?.entries.find(
      (entry) => entry.kind === "file_change" && entry.path === ".env",
    );
    expect(envChange).toMatchObject({ kind: "file_change", withheld: true, diff: null });
    const catEnv = first?.entries.find(
      (entry) => entry.kind === "command" && entry.command === "cat .env",
    );
    expect(catEnv).toMatchObject({
      output: "[output withheld: the command reads a private file]",
    });
  });

  it("withholds files the user marked private", () => {
    const transcript = build({
      redaction: { workspaceRoot: "/Users/dev/project", privatePaths: ["apps/server/src/http.ts"] },
    });
    const route = transcript.turns[0]?.entries.find(
      (entry) => entry.kind === "file_change" && entry.path === "apps/server/src/http.ts",
    );
    expect(route).toMatchObject({ withheld: true, diff: null });
  });

  it("states how much it redacted", () => {
    const { redaction } = build();
    expect(redaction.total).toBeGreaterThanOrEqual(4);
    expect(redaction.byRule["private-file"]).toBe(2);
  });

  it("prices turns when rates are known and sums them", () => {
    const transcript = build({
      price: (_model, usage) => (usage.inputTokens + usage.outputTokens) / 1_000_000,
    });
    expect(transcript.turns.map((turn) => turn.costUsd)).toEqual([0.05035, 0.06332]);
    expect(transcript.totals.costUsd).toBeCloseTo(0.11367, 6);
  });

  it("reports the total cost as unknown when any turn has no rates", () => {
    const transcript = build({
      price: (model, usage) => (model.includes("opus") ? null : usage.outputTokens / 1_000),
    });
    expect(transcript.turns[0]?.costUsd).toBe(2.15);
    expect(transcript.totals.costUsd).toBeNull();
  });

  it("round-trips through parseSessionTranscript", () => {
    const transcript = build();
    expect(parseSessionTranscript(JSON.parse(JSON.stringify(transcript)))).toEqual(transcript);
  });

  it("rejects an id that is not 128 random bits", () => {
    expect(() => build({ id: "../../etc/passwd" })).toThrow(/invalid id/);
  });
});

describe("parseSessionTranscript", () => {
  it("rejects documents the renderer cannot trust", () => {
    const valid = JSON.parse(JSON.stringify(build()));
    expect(() => parseSessionTranscript({ ...valid, version: 2 })).toThrow(/version/);
    expect(() => parseSessionTranscript({ ...valid, id: "short" })).toThrow(/id/);
    expect(() =>
      parseSessionTranscript({
        ...valid,
        turns: [{ entries: [{ kind: "script" }] }],
      }),
    ).toThrow(/entry/);
  });
});

describe("helpers", () => {
  it("createSessionTranscriptId makes 22-character base64url ids", () => {
    const ids = new Set(Array.from({ length: 64 }, createSessionTranscriptId));
    expect(ids.size).toBe(64);
    for (const id of ids) expect(SESSION_TRANSCRIPT_ID_PATTERN.test(id)).toBe(true);
  });

  it("truncateMiddle keeps both ends", () => {
    const text = `${"a".repeat(50)}${"b".repeat(50)}`;
    const cut = truncateMiddle(text, 20);
    expect(cut.startsWith("a".repeat(10))).toBe(true);
    expect(cut.endsWith("b".repeat(10))).toBe(true);
    expect(cut).toContain("80 characters omitted");
  });
});
