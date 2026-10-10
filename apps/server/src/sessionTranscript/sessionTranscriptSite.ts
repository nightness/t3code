/**
 * The published session transcript site: where its files live, which request paths may
 * read them, the headers a page is served with, and the PR body section linking to it.
 *
 * Pure functions, so the route (./http.ts) and the publisher share one set of rules.
 */
import {
  formatCostUsd,
  formatTokenCount,
  SESSION_TRANSCRIPT_ID_PATTERN,
  type SessionTranscript,
} from "@t3tools/shared/sessionTranscript/document";
import { inlineScriptHashes } from "@t3tools/shared/sessionTranscript/csp";

/** The URL prefix the T3 server serves transcripts under (the renderer's `basePath`). */
export const SESSION_TRANSCRIPT_ROUTE_PREFIX = "/transcripts";

/** The workspace file listing extra private paths, one glob per line. */
export const SESSION_TRANSCRIPT_PRIVATE_PATHS_FILE = ".t3code-transcript-private";

/** Under the server's state directory. */
export const SESSION_TRANSCRIPTS_DIR_NAME = "session-transcripts";

const CLIENT_ASSET = /^_denext\/client\/[A-Za-z0-9_.-]+\.(?:js|css)$/;

/**
 * The site-relative file a request path names, or null. Only a transcript page
 * (`<id>/`, `<id>/index.html`) or one of the renderer's client assets can be
 * read: nothing lists the site, and no path leaves it.
 */
export function resolveSessionTranscriptSitePath(pathname: string): string | null {
  if (!pathname.startsWith(`${SESSION_TRANSCRIPT_ROUTE_PREFIX}/`)) return null;
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice(SESSION_TRANSCRIPT_ROUTE_PREFIX.length + 1));
  } catch {
    return null;
  }
  if (CLIENT_ASSET.test(relative)) return relative;
  const page = /^([A-Za-z0-9_-]{22})\/(?:index\.html)?$/.exec(relative);
  if (page && SESSION_TRANSCRIPT_ID_PATTERN.test(page[1]!)) return `${page[1]}/index.html`;
  return null;
}

/** A transcript page without its trailing slash, so the route can redirect to it. */
export function sessionTranscriptPageWithoutSlash(pathname: string): string | null {
  const match = /^\/transcripts\/([A-Za-z0-9_-]{22})$/.exec(pathname);
  return match ? `${pathname}/` : null;
}

/**
 * Headers for a transcript page. The page reaches only its own scripts and
 * styles, never frames or forms, and stays out of search indexes and referrers.
 */
export function sessionTranscriptPageHeaders(html: string): Record<string, string> {
  const scripts = ["'self'", ...inlineScriptHashes(html)].join(" ");
  return {
    "Content-Security-Policy": [
      "default-src 'none'",
      `script-src ${scripts}`,
      "style-src 'self'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
    "Cache-Control": "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

/** The page URL for a transcript, under the base URL the server publishes links with. */
export function sessionTranscriptUrl(baseUrl: string, id: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${SESSION_TRANSCRIPT_ROUTE_PREFIX}/${id}/`;
}

/**
 * The base URL links are published with: `T3CODE_TRANSCRIPT_BASE_URL` when set
 * (where reviewers reach this server, e.g. its tailnet name), else the address
 * the server listens on.
 */
export function sessionTranscriptBaseUrl(input: {
  readonly configured: string | undefined;
  readonly host: string | undefined;
  readonly port: number;
}): string {
  const configured = input.configured?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host =
    !input.host || input.host === "0.0.0.0" || input.host === "::" ? "localhost" : input.host;
  return `http://${host.includes(":") ? `[${host}]` : host}:${input.port}`;
}

/** Appended to a PR body the user opted in for: a link and a one-line summary. */
export function sessionTranscriptPrBodySection(
  transcript: Pick<SessionTranscript, "models" | "totals">,
  url: string,
): string {
  const { totals } = transcript;
  const parts = [
    transcript.models.join(", "),
    `${totals.turns} turn${totals.turns === 1 ? "" : "s"}`,
    `${totals.toolCalls} tool call${totals.toolCalls === 1 ? "" : "s"}`,
    `${formatTokenCount(totals.inputTokens + totals.outputTokens)} tokens`,
  ];
  if (totals.costUsd !== null) parts.push(`${formatCostUsd(totals.costUsd)} at API rates`);
  return `\n\n---\n\n[Session transcript](${url}) · ${parts.filter(Boolean).join(" · ")}\n`;
}
