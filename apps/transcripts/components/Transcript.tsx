// The transcript page body. Server Components only: the markup and class names follow T3's
// own timeline (MessagesTimeline's user and assistant rows, WorkLog's rows,
// TimelineSystemDivider) and the page loads T3's stylesheet, so a transcript reads like the
// thread did in the app. Expanding a tool call is a native <details>, which needs no
// JavaScript; copy buttons are the only island.
import { renderMarkdown } from "@denext/content-collections/markdown";

import {
  formatCostUsd,
  formatDuration,
  formatTokenCount,
  type SessionTranscript,
  type SessionTranscriptEntry,
  type SessionTranscriptPullRequest,
  type SessionTranscriptTurn,
} from "../../../packages/shared/src/sessionTranscript/document.ts";
import { CopyButton } from "./CopyButton.tsx";
import { Icon, type IconName } from "./icons.tsx";
import { TokenChart } from "./TokenChart.tsx";

/** ChatMarkdown's wrapper classes. The renderer escapes raw HTML in the source. */
const MARKDOWN_CLASS =
  "chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/[calc(80%+var(--appearance-contrast-boost)/5)] [overflow-wrap:anywhere] [word-break:break-word]";

/** The monospace body of an expanded tool row. */
const TOOL_BODY_CLASS =
  "m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/80 [overflow-wrap:anywhere]";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(iso: string | null): string | null {
  return iso ? `${DATE_FORMAT.format(new Date(iso))} UTC` : null;
}

function Markdown({ text, id }: { text: string; id?: string }) {
  return (
    <div
      id={id}
      class={MARKDOWN_CLASS}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}

/** TimelineSystemDivider: a centred label between two hairlines. */
function Divider({ children, id }: { children: unknown; id?: string }) {
  return (
    <div
      id={id}
      class="flex min-w-0 scroll-mt-4 items-center gap-2 py-2 text-2xs text-muted-foreground"
    >
      <span aria-hidden="true" class="h-px flex-1 bg-border/70" />
      <span class="flex min-w-0 flex-wrap items-center justify-center gap-1.5 rounded-full px-2 py-1">
        {children}
      </span>
      <span aria-hidden="true" class="h-px flex-1 bg-border/70" />
    </div>
  );
}

/** WorkLog's row line: icon, a truncated label, an optional trailing detail. */
function RowLine({
  icon,
  label,
  trailing,
  tone,
}: {
  icon: IconName;
  label: unknown;
  trailing?: unknown;
  tone?: "danger";
}) {
  return (
    <span class="flex min-h-6 min-w-0 items-center gap-1.5 text-sm leading-relaxed">
      <span class="relative flex size-6 shrink-0 items-center justify-center">
        <Icon
          name={icon}
          class={`size-4 shrink-0 ${tone === "danger" ? "text-destructive" : "text-icon-muted"}`}
        />
      </span>
      <span
        class={`min-w-0 flex-1 truncate ${tone === "danger" ? "text-destructive" : "text-secondary-label"}`}
      >
        {label}
      </span>
      {trailing ? (
        <span class="shrink-0 text-2xs text-muted-foreground tabular-nums">{trailing}</span>
      ) : null}
    </span>
  );
}

/** A tool row that expands to its detail (WorkLogButton + WorkLogDetails), as <details>. */
function ToolRow({
  icon,
  label,
  trailing,
  tone,
  children,
}: {
  icon: IconName;
  label: unknown;
  trailing?: unknown;
  tone?: "danger";
  children?: unknown;
}) {
  if (!children) {
    return (
      <div class="relative w-full min-w-0 rounded-md px-0.5 py-0.5">
        <RowLine icon={icon} label={label} trailing={trailing} tone={tone} />
      </div>
    );
  }
  return (
    <details class="group/timeline-row relative w-full min-w-0 rounded-md px-0.5 py-0.5">
      <summary class="cursor-pointer list-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 [&::-webkit-details-marker]:hidden">
        <RowLine icon={icon} label={label} trailing={trailing} tone={tone} />
      </summary>
      <div class="ms-7 flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text">
        {children}
      </div>
    </details>
  );
}

function DiffBody({ diff }: { diff: string }) {
  return (
    <pre class={TOOL_BODY_CLASS}>
      {diff.split("\n").map((line, index) => (
        <span
          // oxlint-disable-next-line react/no-array-index-key -- Diff lines repeat; their position is their identity in this static list.
          key={index}
          class={`block ${
            line.startsWith("+") && !line.startsWith("+++")
              ? "text-diff-addition-foreground"
              : line.startsWith("-") && !line.startsWith("---")
                ? "text-diff-deletion-foreground"
                : line.startsWith("@@")
                  ? "text-muted-foreground"
                  : ""
          }`}
        >
          {line || " "}
        </span>
      ))}
    </pre>
  );
}

function Entry({ entry, id }: { entry: SessionTranscriptEntry; id: string }) {
  switch (entry.kind) {
    case "user":
      return <UserBubble text={entry.text} id={id} />;
    case "assistant":
      return (
        <div class="group/assistant relative min-w-0 px-1 py-0.5">
          <Markdown text={entry.text} id={id} />
          <div class="mt-1.5 flex items-center gap-2">
            <CopyButton target={id} label="Copy message" client:interaction />
          </div>
        </div>
      );
    case "reasoning":
      return (
        <ToolRow icon="brain" label="Thought">
          <Markdown text={entry.text} />
        </ToolRow>
      );
    case "command":
      return (
        <ToolRow
          icon={entry.failed ? "circle-alert" : "terminal"}
          tone={entry.failed ? "danger" : undefined}
          label={<code class="font-mono text-xs">{entry.command.split("\n")[0]}</code>}
          trailing={
            entry.exitCode !== null && entry.exitCode !== 0 ? `exit ${entry.exitCode}` : null
          }
        >
          {entry.command.includes("\n") ? <pre class={TOOL_BODY_CLASS}>{entry.command}</pre> : null}
          {entry.output ? (
            <pre class={`${TOOL_BODY_CLASS} text-muted-foreground`}>{entry.output}</pre>
          ) : null}
        </ToolRow>
      );
    case "tool":
      return (
        <ToolRow icon="wrench" label={entry.name}>
          {entry.input ? <pre class={TOOL_BODY_CLASS}>{entry.input}</pre> : null}
          {entry.output ? (
            <pre class={`${TOOL_BODY_CLASS} text-muted-foreground`}>{entry.output}</pre>
          ) : null}
        </ToolRow>
      );
    case "file_change": {
      const stats = [
        entry.additions !== null ? `+${entry.additions}` : null,
        entry.deletions !== null ? `-${entry.deletions}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <ToolRow
          icon="file-pen"
          label={
            <span>
              Edited <code class="font-mono text-xs">{entry.path}</code>
            </span>
          }
          trailing={entry.withheld ? "private" : stats || null}
        >
          {entry.withheld ? (
            <p class="m-0 text-xs text-muted-foreground">
              Contents withheld: this file is private.
            </p>
          ) : entry.diff ? (
            <DiffBody diff={entry.diff} />
          ) : null}
        </ToolRow>
      );
    }
    case "search":
      return (
        <ToolRow
          icon={entry.scope === "web" ? "globe" : "search"}
          label={`${entry.scope === "web" ? "Searched the web" : "Searched files"}${entry.query ? ` for ${entry.query}` : ""}`}
          trailing={entry.resultCount !== null ? `${entry.resultCount} results` : null}
        />
      );
    case "plan":
      return (
        <div class="rounded-xl border border-border/70 bg-card p-3">
          <p class="mb-2 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
            Plan
          </p>
          <Markdown text={entry.markdown} />
        </div>
      );
    case "todo":
      return (
        <ToolRow
          icon="list-todo"
          label={`To-do list · ${entry.steps.filter((s) => s.status === "completed").length}/${entry.steps.length} done`}
        >
          <ul class="m-0 list-none p-0 text-sm">
            {entry.steps.map((step, index) => (
              <li
                // oxlint-disable-next-line react/no-array-index-key -- Steps can share text; the list never reorders.
                key={index}
                class={
                  step.status === "completed"
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }
              >
                {step.text}
              </li>
            ))}
          </ul>
        </ToolRow>
      );
    case "subagent":
      return (
        <ToolRow icon="bot" label="Subagent">
          <pre class={TOOL_BODY_CLASS}>{entry.prompt}</pre>
          {entry.result ? <Markdown text={entry.result} /> : null}
        </ToolRow>
      );
    case "notice":
      return (
        <ToolRow
          icon={entry.tone === "danger" ? "circle-alert" : "info"}
          tone={entry.tone === "danger" ? "danger" : undefined}
          label={entry.text}
        />
      );
  }
}

const NO_ATTACHMENTS: ReadonlyArray<string> = [];

/** MessagesTimeline's user row: a right-aligned bubble. */
function UserBubble({
  text,
  id,
  attachments = NO_ATTACHMENTS,
}: {
  text: string;
  id: string;
  attachments?: ReadonlyArray<string>;
}) {
  return (
    <div class="group flex flex-col items-end gap-1">
      <div class="relative max-w-[80%] rounded-2xl bg-message p-3 text-message-foreground">
        <Markdown text={text} id={id} />
        {attachments.length > 0 ? (
          <p class="mt-2 text-2xs text-muted-foreground">Attached: {attachments.join(", ")}</p>
        ) : null}
      </div>
      <CopyButton target={id} label="Copy prompt" client:interaction />
    </div>
  );
}

function Turn({ turn }: { turn: SessionTranscriptTurn }) {
  const tokens = turn.usage ? turn.usage.inputTokens + turn.usage.outputTokens : null;
  return (
    <section aria-label={`Turn ${turn.ordinal}`} class="flex flex-col gap-2">
      <Divider id={`turn-${turn.ordinal}`}>
        <span class="font-medium">Turn {turn.ordinal}</span>
        <span class="opacity-70">· {turn.model}</span>
        {turn.durationMs !== null ? (
          <span class="opacity-70">· {formatDuration(turn.durationMs)}</span>
        ) : null}
        {tokens !== null ? (
          <span class="opacity-70">· {formatTokenCount(tokens)} tokens</span>
        ) : null}
        {turn.costUsd !== null ? (
          <span class="opacity-70">· {formatCostUsd(turn.costUsd)}</span>
        ) : null}
        {turn.status !== "completed" ? <span class="text-destructive">· {turn.status}</span> : null}
      </Divider>
      {turn.user ? (
        <UserBubble
          text={turn.user.text}
          id={`turn-${turn.ordinal}-prompt`}
          attachments={turn.user.attachments}
        />
      ) : null}
      <div class="flex flex-col gap-1">
        {turn.entries.map((entry, index) => (
          <Entry
            // oxlint-disable-next-line react/no-array-index-key -- Entries have no id of their own; a static page never reorders them.
            key={`turn-${turn.ordinal}-entry-${index}`}
            entry={entry}
            id={`turn-${turn.ordinal}-entry-${index}`}
          />
        ))}
      </div>
    </section>
  );
}

const PR_CHIP_CLASS =
  "inline-flex w-fit max-w-full flex-wrap items-center gap-x-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs text-foreground";

/** The PR this session produced; a link only to an http(s) URL. */
function PullRequestChip({ pullRequest }: { pullRequest: SessionTranscriptPullRequest }) {
  const content = (
    <>
      <Icon name="git-pull-request" class="size-3.5 text-icon-muted" />
      {pullRequest.number !== null ? `#${pullRequest.number} ` : ""}
      {pullRequest.title}
      <span class="text-muted-foreground">
        {pullRequest.headBranch} → {pullRequest.baseBranch}
      </span>
    </>
  );
  return pullRequest.url !== null && /^https?:\/\//i.test(pullRequest.url) ? (
    <a href={pullRequest.url} rel="noopener noreferrer" class={`${PR_CHIP_CLASS} hover:bg-accent`}>
      {content}
    </a>
  ) : (
    <span class={PR_CHIP_CLASS}>{content}</span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div class="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border/70 bg-card px-3 py-2">
      <dt class="text-2xs text-muted-foreground">{label}</dt>
      <dd class="m-0 text-sm font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

export function TranscriptPage({ transcript }: { transcript: SessionTranscript }) {
  const { totals } = transcript;
  const started = formatDate(transcript.startedAt);
  return (
    <main class="mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-6 px-4 py-8">
      <header class="flex flex-col gap-3">
        <p class="m-0 flex items-center gap-1.5 text-2xs text-muted-foreground">
          <Icon name="message-square" class="size-3.5" />
          T3 Code session transcript{started ? ` · ${started}` : ""}
        </p>
        <h1 class="m-0 text-lg font-semibold text-foreground">{transcript.title}</h1>
        {transcript.pullRequest ? <PullRequestChip pullRequest={transcript.pullRequest} /> : null}
        <dl class="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Model" value={transcript.models.join(", ") || "n/a"} />
          <Stat label="Turns" value={String(totals.turns)} />
          <Stat
            label="Tokens"
            value={`${formatTokenCount(totals.inputTokens)} in · ${formatTokenCount(totals.outputTokens)} out`}
          />
          <Stat label="Cost (API rates)" value={formatCostUsd(totals.costUsd)} />
        </dl>
        {transcript.toolsUsed.length > 0 ? (
          <p class="m-0 text-xs text-muted-foreground">
            <span class="text-foreground">{totals.toolCalls} tool calls</span>
            {" · "}
            {transcript.toolsUsed.map((tool) => `${tool.name} ${tool.count}`).join(" · ")}
            {totals.durationMs !== null ? ` · ${formatDuration(totals.durationMs)}` : ""}
          </p>
        ) : null}
        <TokenChart turns={transcript.turns} />
      </header>

      <div class="flex flex-col gap-4">
        {transcript.turns.map((turn) => (
          <Turn key={turn.ordinal} turn={turn} />
        ))}
      </div>

      <footer class="flex flex-col gap-1 border-t border-border/70 pt-4 text-2xs text-muted-foreground">
        <p class="m-0">
          Redaction removed {transcript.redaction.total} item
          {transcript.redaction.total === 1 ? "" : "s"}
          {transcript.redaction.total > 0
            ? ` (${Object.entries(transcript.redaction.byRule)
                .map(([rule, count]) => `${rule} ${count}`)
                .join(", ")})`
            : ""}
          . Credentials, private files and the author's home directory are never published.
        </p>
        <p class="m-0">
          Provider {transcript.provider}
          {transcript.branch ? ` · branch ${transcript.branch}` : ""} · exported{" "}
          {formatDate(transcript.exportedAt)}. Cost is the API-equivalent price of the tokens, not
          what a subscription billed.
        </p>
      </footer>
    </main>
  );
}
