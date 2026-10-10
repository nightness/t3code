// Tokens per turn as stacked horizontal bars: cached input, uncached input and output share
// one scale (the largest turn), so turns compare by length. Server-rendered HTML and CSS, no
// JavaScript: each segment's hover detail is a native tooltip, and every row carries its
// total and cost as text, which doubles as the table view.
import {
  formatCostUsd,
  formatTokenCount,
  type SessionTranscriptTurn,
} from "../../../packages/shared/src/sessionTranscript/document.ts";

const SERIES = [
  { key: "cached", label: "Cached input", color: "var(--transcript-series-cached)" },
  { key: "input", label: "Input", color: "var(--transcript-series-input)" },
  { key: "output", label: "Output", color: "var(--transcript-series-output)" },
] as const;

function segments(turn: SessionTranscriptTurn) {
  const usage = turn.usage;
  if (!usage) return null;
  return {
    cached: usage.cachedInputTokens,
    input: Math.max(0, usage.inputTokens - usage.cachedInputTokens),
    output: usage.outputTokens,
  };
}

export function TokenChart({ turns }: { turns: ReadonlyArray<SessionTranscriptTurn> }) {
  const rows = turns.map((turn) => ({ turn, parts: segments(turn) }));
  const max = Math.max(
    1,
    ...rows.map(({ parts }) => (parts ? parts.cached + parts.input + parts.output : 0)),
  );
  if (rows.every(({ parts }) => parts === null)) return null;
  return (
    <figure class="flex flex-col gap-2" aria-labelledby="token-chart-title">
      <figcaption class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id="token-chart-title" class="text-xs font-medium text-foreground">
          Tokens per turn
        </span>
        <span class="flex flex-wrap gap-3 text-2xs text-muted-foreground">
          {SERIES.map((series) => (
            <span key={series.key} class="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                class="inline-block size-2 rounded-[2px]"
                style={{ background: series.color }}
              />
              {series.label}
            </span>
          ))}
        </span>
      </figcaption>
      <ol class="flex flex-col gap-1.5">
        {rows.map(({ turn, parts }) => {
          const total = parts ? parts.cached + parts.input + parts.output : 0;
          return (
            <li
              key={turn.ordinal}
              class="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-2xs tabular-nums"
            >
              <a href={`#turn-${turn.ordinal}`} class="text-muted-foreground hover:text-foreground">
                Turn {turn.ordinal}
              </a>
              <span
                class="flex h-2.5 min-w-0 gap-[2px]"
                style={{ width: `${(total / max) * 100}%` }}
              >
                {parts
                  ? SERIES.filter((series) => parts[series.key] > 0).map((series) => (
                      <span
                        key={series.key}
                        // oxlint-disable-next-line t3code/no-native-title-tooltip -- A static page with no JavaScript: the native tooltip is the only hover detail it has, and each row also prints its totals.
                        title={`${series.label}: ${parts[series.key].toLocaleString("en-US")} tokens`}
                        class="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{ flex: `${parts[series.key]} 1 0`, background: series.color }}
                      />
                    ))
                  : null}
              </span>
              <span class="text-muted-foreground">
                {parts ? `${formatTokenCount(total)} · ${formatCostUsd(turn.costUsd)}` : "n/a"}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
