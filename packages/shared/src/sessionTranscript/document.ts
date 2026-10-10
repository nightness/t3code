/**
 * The session transcript document: one T3 thread, redacted, as the static
 * transcript page renders it. It is the contract between the server (which
 * builds and redacts it, `./build.ts` + `./redact.ts`) and the renderer
 * (`apps/transcripts`, a denext app that exports it to static HTML).
 *
 * This module has no imports so the Deno renderer can load it by path.
 */

export const SESSION_TRANSCRIPT_VERSION = 1;

/** Ids are 128 random bits, base64url: the URL is the only capability to read a page. */
export const SESSION_TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export interface SessionTranscriptTokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
}

export type SessionTranscriptEntry =
  /** A user reply sent while the turn ran (steering, an answered question). */
  | { readonly kind: "user"; readonly text: string }
  | { readonly kind: "assistant"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | {
      readonly kind: "command";
      readonly command: string;
      readonly output: string | null;
      readonly exitCode: number | null;
      readonly failed: boolean;
    }
  | {
      readonly kind: "tool";
      readonly name: string;
      readonly input: string | null;
      readonly output: string | null;
    }
  | {
      readonly kind: "file_change";
      readonly path: string;
      readonly additions: number | null;
      readonly deletions: number | null;
      readonly diff: string | null;
      /** The file is private: its contents were withheld, only the path remains. */
      readonly withheld: boolean;
    }
  | {
      readonly kind: "search";
      readonly scope: "files" | "web";
      readonly query: string;
      readonly resultCount: number | null;
    }
  | { readonly kind: "plan"; readonly markdown: string }
  | {
      readonly kind: "todo";
      readonly steps: ReadonlyArray<{
        readonly text: string;
        readonly status: "pending" | "running" | "completed";
      }>;
    }
  | {
      readonly kind: "subagent";
      readonly prompt: string;
      readonly result: string | null;
    }
  | { readonly kind: "notice"; readonly text: string; readonly tone: "neutral" | "danger" };

export type SessionTranscriptEntryKind = SessionTranscriptEntry["kind"];

export interface SessionTranscriptTurn {
  readonly ordinal: number;
  readonly model: string;
  readonly status: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly durationMs: number | null;
  /** The user's message that started this turn (the first turn's is the original prompt). */
  readonly user: { readonly text: string; readonly attachments: ReadonlyArray<string> } | null;
  readonly entries: ReadonlyArray<SessionTranscriptEntry>;
  readonly usage: SessionTranscriptTokenUsage | null;
  /** API-equivalent cost of the turn's tokens; null when the model has no known rates. */
  readonly costUsd: number | null;
}

export interface SessionTranscriptPullRequest {
  /** Null while the transcript is published ahead of the PR it is linked from. */
  readonly url: string | null;
  readonly number: number | null;
  readonly title: string;
  readonly baseBranch: string;
  readonly headBranch: string;
}

export interface SessionTranscript {
  readonly version: typeof SESSION_TRANSCRIPT_VERSION;
  readonly id: string;
  readonly title: string;
  readonly exportedAt: string;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  /** The provider instance the thread ran on (e.g. "codex", "claudeAgent"). */
  readonly provider: string;
  /** Distinct models in the order the thread first used them. */
  readonly models: ReadonlyArray<string>;
  /** The original prompt: the thread's first user message. */
  readonly prompt: string;
  readonly branch: string | null;
  readonly pullRequest: SessionTranscriptPullRequest | null;
  readonly toolsUsed: ReadonlyArray<{ readonly name: string; readonly count: number }>;
  readonly turns: ReadonlyArray<SessionTranscriptTurn>;
  readonly totals: SessionTranscriptTokenUsage & {
    readonly turns: number;
    readonly toolCalls: number;
    readonly costUsd: number | null;
    readonly durationMs: number | null;
  };
  /** What redaction changed, by rule. The page states it so readers know text was removed. */
  readonly redaction: {
    readonly total: number;
    readonly byRule: Readonly<Record<string, number>>;
  };
}

const ENTRY_KINDS: ReadonlySet<string> = new Set<SessionTranscriptEntryKind>([
  "user",
  "assistant",
  "reasoning",
  "command",
  "tool",
  "file_change",
  "search",
  "plan",
  "todo",
  "subagent",
  "notice",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks the parts of a document the renderer depends on. The renderer only
 * reads documents this server wrote, so this guards against a truncated or
 * hand-edited file rather than an adversary.
 */
export function parseSessionTranscript(value: unknown): SessionTranscript {
  if (!isRecord(value)) throw new Error("session transcript: not an object");
  if (value.version !== SESSION_TRANSCRIPT_VERSION) {
    throw new Error(`session transcript: unsupported version ${String(value.version)}`);
  }
  if (typeof value.id !== "string" || !SESSION_TRANSCRIPT_ID_PATTERN.test(value.id)) {
    throw new Error("session transcript: invalid id");
  }
  if (typeof value.title !== "string" || typeof value.prompt !== "string") {
    throw new Error("session transcript: missing title or prompt");
  }
  if (!Array.isArray(value.turns) || !Array.isArray(value.models)) {
    throw new Error("session transcript: missing turns or models");
  }
  for (const turn of value.turns) {
    if (!isRecord(turn) || !Array.isArray(turn.entries)) {
      throw new Error("session transcript: malformed turn");
    }
    for (const entry of turn.entries) {
      if (!isRecord(entry) || typeof entry.kind !== "string" || !ENTRY_KINDS.has(entry.kind)) {
        throw new Error("session transcript: malformed entry");
      }
    }
  }
  if (!isRecord(value.totals) || !isRecord(value.redaction)) {
    throw new Error("session transcript: missing totals or redaction");
  }
  return value as unknown as SessionTranscript;
}

const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTokenCount(tokens: number): string {
  return tokens < 1000 ? String(tokens) : COMPACT_NUMBER.format(tokens);
}

export function formatCostUsd(costUsd: number | null): string {
  if (costUsd === null) return "n/a";
  if (costUsd > 0 && costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

/** @public Used by the renderer (apps/transcripts), a Deno app outside the pnpm workspaces. */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return "n/a";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
