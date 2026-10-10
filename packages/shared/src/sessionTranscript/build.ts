/**
 * Builds a redacted session transcript from a thread projection.
 *
 * Every string that leaves the projection goes through the redactor; the
 * contents of private files are withheld rather than redacted line by line.
 */
import type {
  OrchestrationV2ProjectedTurnItem,
  OrchestrationV2Run,
  OrchestrationV2ThreadProjection,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  SESSION_TRANSCRIPT_ID_PATTERN,
  SESSION_TRANSCRIPT_VERSION,
  type SessionTranscript,
  type SessionTranscriptEntry,
  type SessionTranscriptPullRequest,
  type SessionTranscriptTokenUsage,
  type SessionTranscriptTurn,
} from "./document.ts";
import { SessionTranscriptRedactor, type SessionTranscriptRedactionOptions } from "./redact.ts";

/** Long fields are cut so one runaway log does not make the page unreadable. */
const SESSION_TRANSCRIPT_LIMITS = {
  message: 40_000,
  output: 6_000,
  toolInput: 4_000,
  diff: 30_000,
} as const;

export interface BuildSessionTranscriptInput {
  readonly id: string;
  readonly projection: OrchestrationV2ThreadProjection;
  readonly exportedAt: DateTime.Utc;
  readonly pullRequest?: SessionTranscriptPullRequest | null;
  readonly redaction?: SessionTranscriptRedactionOptions;
  /** API-equivalent cost of a turn's tokens, or null when the model has no known rates. */
  readonly price?: (model: string, usage: SessionTranscriptTokenUsage) => number | null;
}

/** 128 random bits as base64url (22 characters). */
export function createSessionTranscriptId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function iso(value: DateTime.Utc | null | undefined): string | null {
  return value ? DateTime.formatIso(value) : null;
}

function millis(value: DateTime.Utc | null | undefined): number | null {
  return value ? DateTime.toEpochMillis(value) : null;
}

/** Keeps the start and the end of a long text, which is where logs say what happened. */
export function truncateMiddle(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  const omitted = text.length - half * 2;
  return `${text.slice(0, half)}\n… ${omitted.toLocaleString("en-US")} characters omitted …\n${text.slice(-half)}`;
}

function stringifyToolValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const EMPTY_USAGE: SessionTranscriptTokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

function addUsage(
  left: SessionTranscriptTokenUsage,
  right: SessionTranscriptTokenUsage,
): SessionTranscriptTokenUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
  };
}

/** The tokens a run's provider turns reported; null when none reported any. */
function runUsage(
  projection: OrchestrationV2ThreadProjection,
  run: OrchestrationV2Run,
): SessionTranscriptTokenUsage | null {
  const attemptIds = new Set(
    projection.attempts.filter((attempt) => attempt.runId === run.id).map((attempt) => attempt.id),
  );
  let usage: SessionTranscriptTokenUsage | null = null;
  for (const turn of projection.providerTurns) {
    if (turn.runAttemptId === null || !attemptIds.has(turn.runAttemptId)) continue;
    const reported = turn.turnTokenUsage;
    const live = turn.tokenUsage;
    const next: SessionTranscriptTokenUsage | null = reported
      ? {
          inputTokens: reported.inputTokens ?? 0,
          cachedInputTokens: reported.cachedInputTokens ?? 0,
          outputTokens: reported.outputTokens ?? 0,
          reasoningTokens: reported.reasoningTokens ?? 0,
        }
      : live
        ? {
            inputTokens: live.inputTokens ?? 0,
            cachedInputTokens: live.cachedInputTokens ?? 0,
            outputTokens: live.outputTokens ?? 0,
            reasoningTokens: live.reasoningOutputTokens ?? 0,
          }
        : null;
    if (next) usage = addUsage(usage ?? EMPTY_USAGE, next);
  }
  return usage;
}

/** The label the tools summary counts an item under; null for non-tool items. */
function toolLabel(item: OrchestrationV2TurnItem): string | null {
  switch (item.type) {
    case "command_execution":
      return "Shell";
    case "file_change":
      return "Edit";
    case "file_search":
      return "File search";
    case "web_search":
      return "Web search";
    case "dynamic_tool":
      return item.toolName ?? "Tool";
    case "subagent":
      return "Subagent";
    default:
      return null;
  }
}

class EntryBuilder {
  private readonly redactor: SessionTranscriptRedactor;

  constructor(redactor: SessionTranscriptRedactor) {
    this.redactor = redactor;
  }

  build(
    item: OrchestrationV2TurnItem,
    turnUserMessageId: string | null,
  ): SessionTranscriptEntry | null {
    const r = this.redactor;
    const limits = SESSION_TRANSCRIPT_LIMITS;
    switch (item.type) {
      case "user_message":
        // The message that started the turn is the turn's header, not an entry.
        if (item.messageId === turnUserMessageId || item.text.trim() === "") return null;
        return { kind: "user", text: r.text(truncateMiddle(item.text, limits.message)) };
      case "assistant_message":
        if (item.text.trim() === "") return null;
        return { kind: "assistant", text: r.text(truncateMiddle(item.text, limits.message)) };
      case "reasoning":
        if (item.text.trim() === "") return null;
        return { kind: "reasoning", text: r.text(truncateMiddle(item.text, limits.message)) };
      case "proposed_plan":
        return { kind: "plan", markdown: r.text(truncateMiddle(item.markdown, limits.message)) };
      case "todo_list":
        return {
          kind: "todo",
          steps: item.steps.map((step) => ({ text: r.text(step.text), status: step.status })),
        };
      case "command_execution": {
        const withheld = r.mentionsPrivateFile(item.input);
        if (withheld) r.tally.add("private-file");
        const output =
          item.output === undefined
            ? null
            : withheld
              ? "[output withheld: the command reads a private file]"
              : r.text(truncateMiddle(item.output, limits.output));
        return {
          kind: "command",
          command: r.text(truncateMiddle(item.input, limits.toolInput)),
          output,
          exitCode: item.exitCode ?? null,
          failed:
            item.status === "failed" ||
            item.outputIndicatesFailure === true ||
            (item.exitCode !== undefined && item.exitCode !== 0),
        };
      }
      case "dynamic_tool": {
        const input = stringifyToolValue(item.input);
        const output = stringifyToolValue(item.output);
        const withheld = input !== null && r.mentionsPrivateFile(input);
        if (withheld && output !== null) r.tally.add("private-file");
        return {
          kind: "tool",
          name: r.text(item.toolName ?? item.title ?? "Tool"),
          input: input === null ? null : r.text(truncateMiddle(input, limits.toolInput)),
          output:
            output === null
              ? null
              : withheld
                ? "[output withheld: the tool reads a private file]"
                : r.text(truncateMiddle(output, limits.output)),
        };
      }
      case "file_change": {
        const withheld = r.isPrivateFile(item.fileName);
        const rawDiff = item.diffStr ?? null;
        if (withheld && rawDiff !== null) r.tally.add("private-file");
        return {
          kind: "file_change",
          path: r.path(item.fileName),
          additions: item.additions ?? null,
          deletions: item.deletions ?? null,
          diff: withheld || rawDiff === null ? null : r.text(truncateMiddle(rawDiff, limits.diff)),
          withheld,
        };
      }
      case "file_search":
        return {
          kind: "search",
          scope: "files",
          query: r.text(item.pattern ?? item.title ?? ""),
          resultCount: item.results?.length ?? null,
        };
      case "web_search":
        return {
          kind: "search",
          scope: "web",
          query: r.text((item.patterns ?? []).join(", ") || item.title || ""),
          resultCount: item.results?.length ?? null,
        };
      case "subagent":
        return {
          kind: "subagent",
          prompt: r.text(truncateMiddle(item.prompt, limits.toolInput)),
          result: r.optionalText(
            item.result === null ? null : truncateMiddle(item.result, limits.output),
          ),
        };
      case "error":
        return { kind: "notice", text: r.text(item.failure.message), tone: "danger" };
      case "system_notice":
        return { kind: "notice", text: r.text(item.message), tone: "neutral" };
      case "run_interrupt_result":
        return { kind: "notice", text: r.text(item.message || "Interrupted"), tone: "neutral" };
      case "compaction":
        return { kind: "notice", text: "Context compacted", tone: "neutral" };
      case "handoff":
        return {
          kind: "notice",
          text: `Handed off${item.toModel ? ` to ${r.text(item.toModel)}` : ""}`,
          tone: "neutral",
        };
      case "secret_request":
        // The label names the secret; its value never reaches the projection.
        return {
          kind: "notice",
          text: `Requested a secret: ${r.text(item.label)}`,
          tone: "neutral",
        };
      default:
        // Approvals, checkpoints, notifications, forks: bookkeeping, not the session.
        return null;
    }
  }
}

function sortedVisibleItems(
  projection: OrchestrationV2ThreadProjection,
): ReadonlyArray<OrchestrationV2ProjectedTurnItem> {
  return projection.visibleTurnItems
    .filter((projected) => projected.visibility !== "synthetic")
    .sort((left, right) => left.position - right.position);
}

export function buildSessionTranscript(input: BuildSessionTranscriptInput): SessionTranscript {
  if (!SESSION_TRANSCRIPT_ID_PATTERN.test(input.id)) {
    throw new Error("buildSessionTranscript: invalid id");
  }
  const { projection } = input;
  const redactor = new SessionTranscriptRedactor(input.redaction);
  const entries = new EntryBuilder(redactor);
  const runs = [...projection.runs].sort((left, right) => left.ordinal - right.ordinal);
  const messagesById = new Map(projection.messages.map((message) => [message.id, message]));

  // Items carry their run; bookkeeping items without one join the run before them.
  const itemsByRun = new Map<string, OrchestrationV2TurnItem[]>();
  let lastRunId: string | null = null;
  for (const projected of sortedVisibleItems(projection)) {
    const runId: string | null = projected.item.runId ?? lastRunId;
    if (runId === null) continue;
    lastRunId = runId;
    const bucket = itemsByRun.get(runId);
    if (bucket) bucket.push(projected.item);
    else itemsByRun.set(runId, [projected.item]);
  }

  const toolCounts = new Map<string, number>();
  const models: string[] = [];
  let totals: SessionTranscriptTokenUsage = EMPTY_USAGE;
  let totalCost: number | null = null;
  let anyUnpriced = false;
  let toolCalls = 0;

  const turns: SessionTranscriptTurn[] = [];
  for (const run of runs) {
    const items = itemsByRun.get(run.id) ?? [];
    const userMessage = messagesById.get(run.userMessageId);
    const model = run.modelSelection.model;
    if (!models.includes(model)) models.push(model);
    const turnEntries: SessionTranscriptEntry[] = [];
    for (const item of items) {
      const label = toolLabel(item);
      if (label !== null) {
        toolCalls += 1;
        toolCounts.set(label, (toolCounts.get(label) ?? 0) + 1);
      }
      const entry = entries.build(item, run.userMessageId);
      if (entry) turnEntries.push(entry);
    }
    if (turnEntries.length === 0 && !userMessage) continue;
    const usage = runUsage(projection, run);
    const costUsd = usage && input.price ? input.price(model, usage) : null;
    if (usage) totals = addUsage(totals, usage);
    if (costUsd !== null) totalCost = (totalCost ?? 0) + costUsd;
    else if (usage) anyUnpriced = true;
    const started = millis(run.startedAt);
    const completed = millis(run.completedAt);
    turns.push({
      ordinal: turns.length + 1,
      model: redactor.text(model),
      status: run.status,
      startedAt: iso(run.startedAt),
      completedAt: iso(run.completedAt),
      durationMs: started !== null && completed !== null ? completed - started : null,
      user: userMessage
        ? {
            text: redactor.text(
              truncateMiddle(userMessage.text, SESSION_TRANSCRIPT_LIMITS.message),
            ),
            attachments: userMessage.attachments.map((attachment) =>
              redactor.text(attachment.name),
            ),
          }
        : null,
      entries: turnEntries,
      usage,
      costUsd,
    });
  }

  const firstRun = runs[0];
  const lastRun = runs.at(-1);
  const startedAt = firstRun ? iso(firstRun.startedAt ?? firstRun.requestedAt) : null;
  const endedAt = lastRun ? iso(lastRun.completedAt) : null;
  const startMs = firstRun ? millis(firstRun.startedAt ?? firstRun.requestedAt) : null;
  const endMs = lastRun ? millis(lastRun.completedAt) : null;
  const firstPrompt = turns.find((turn) => turn.user !== null)?.user?.text ?? "";
  const pullRequest = input.pullRequest
    ? {
        ...input.pullRequest,
        title: redactor.text(input.pullRequest.title),
        url: input.pullRequest.url === null ? null : redactor.text(input.pullRequest.url),
      }
    : null;

  return {
    version: SESSION_TRANSCRIPT_VERSION,
    id: input.id,
    title: redactor.text(projection.thread.title),
    exportedAt: DateTime.formatIso(input.exportedAt),
    startedAt,
    endedAt,
    provider: redactor.text(projection.thread.providerInstanceId),
    models: models.map((model) => redactor.text(model)),
    prompt: firstPrompt,
    branch: projection.thread.branch ? redactor.text(projection.thread.branch) : null,
    pullRequest,
    toolsUsed: [...toolCounts]
      .map(([name, count]) => ({ name: redactor.text(name), count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    turns,
    totals: {
      ...totals,
      turns: turns.length,
      toolCalls,
      // A partial sum would understate the cost, so any unpriced turn makes it unknown.
      costUsd: anyUnpriced ? null : totalCost,
      durationMs: startMs !== null && endMs !== null ? endMs - startMs : null,
    },
    redaction: { total: redactor.tally.total, byRule: { ...redactor.tally.byRule } },
  };
}
