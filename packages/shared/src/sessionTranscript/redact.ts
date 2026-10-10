/**
 * Conservative secret redaction for session transcripts.
 *
 * A transcript leaves the machine as a page anyone with the link can read, so
 * this errs towards removing text: anything shaped like a credential is
 * replaced, values assigned to credential-named keys are replaced, the
 * contents of private files are withheld, and the user's home directory is
 * shortened to `~`. False positives cost a reader some context; a false
 * negative leaks a secret.
 *
 * No imports, so the renderer and tests can load it anywhere.
 */

export const REDACTED = "[redacted]";

interface PatternRule {
  readonly name: string;
  readonly pattern: RegExp;
  /** Replacement; `$1`-style groups keep the non-secret part (a key name, a URL scheme). */
  readonly replace: string;
}

/**
 * Credential-looking names: environment variables, JSON keys, CLI flags.
 * Matched case-insensitively against the whole name.
 */
const SECRET_NAME =
  "[A-Za-z0-9_.-]*(?:secret|token|passw(?:or)?d|passwd|pwd|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|credential|auth|session|cookie|signature|dsn|webhook)[A-Za-z0-9_.-]*";

const SECRET_NAME_PATTERN = new RegExp(`^${SECRET_NAME}$`, "i");

/**
 * The value side of an assignment worth redacting: six or more characters that
 * are not already redacted, a bare number (`max_tokens: 4096`), a literal, an
 * auth scheme whose token the header rule handles, or the next flag (`--a --b x`
 * must leave `--b` for its own match, or `x` would survive).
 */
const SECRET_VALUE =
  "(?!\\[redacted\\])(?!-)(?:(?!(?:Bearer|Basic|Token|DPoP)\\s))(?![0-9]+(?![^\\s\"'`,;)}\\]]))(?!(?:true|false|null|undefined|none)(?![^\\s\"'`,;)}\\]]))[^\\s\"'`,;)}\\]]{6,}";

// Order matters: specific token formats first, so a `TOKEN=ghp_…` line is
// counted as the token it is; the generic assignment rule then finds nothing.
const PATTERN_RULES: ReadonlyArray<PatternRule> = [
  {
    name: "private-key",
    pattern:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g,
    replace: REDACTED,
  },
  {
    name: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    replace: REDACTED,
  },
  { name: "gitlab-token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/g, replace: REDACTED },
  {
    name: "api-key",
    // OpenAI / Anthropic (sk-, sk-ant-, sk-proj-), Stripe / Clerk (sk_live_, rk_test_, …).
    pattern: /\b(?:sk-[A-Za-z0-9_-]{20,}|[sprw]k_(?:live|test)_[A-Za-z0-9]{16,})\b/g,
    replace: REDACTED,
  },
  { name: "slack-token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, replace: REDACTED },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: REDACTED },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: REDACTED },
  { name: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, replace: REDACTED },
  {
    name: "sendgrid-key",
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
    replace: REDACTED,
  },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: REDACTED,
  },
  {
    name: "authorization-header",
    pattern: /\b(Bearer|Basic|Token|DPoP)\s+[A-Za-z0-9._~+/=-]{12,}/g,
    replace: `$1 ${REDACTED}`,
  },
  {
    name: "url-credentials",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@'"`]+:[^\s/@'"`]+@/gi,
    replace: `$1${REDACTED}@`,
  },
  {
    // "apiKey": "value" / 'client_secret': 'value' in JSON, JS and YAML-ish text.
    name: "quoted-secret-assignment",
    pattern: new RegExp(
      `(["'\`]${SECRET_NAME}["'\`]\\s*[:=]\\s*["'\`])[^"'\`\\n]{4,}(["'\`])`,
      "gi",
    ),
    replace: `$1${REDACTED}$2`,
  },
  {
    // --api-key value, --token=value.
    name: "secret-flag",
    pattern: new RegExp(`(--${SECRET_NAME}(?:=|\\s+)["']?)${SECRET_VALUE}`, "gi"),
    replace: `$1${REDACTED}`,
  },
  {
    // TOKEN=value, export API_KEY="value", password: value.
    name: "secret-assignment",
    pattern: new RegExp(`(\\b${SECRET_NAME}["']?\\s*[:=]\\s*["']?)${SECRET_VALUE}`, "gi"),
    replace: `$1${REDACTED}`,
  },
  {
    // A long token that mixes upper case, lower case and digits (base64-ish key
    // material). Git SHAs and other lower-case hex stay readable.
    name: "high-entropy",
    pattern:
      /(?<![A-Za-z0-9+/_-])(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[0-9])[A-Za-z0-9+/_-]{40,}={0,2}(?![A-Za-z0-9+/_-])/g,
    replace: REDACTED,
  },
];

/**
 * Files whose contents never appear in a transcript, whatever the user marks.
 * `.env.example` and friends are templates and stay visible.
 */
const DEFAULT_PRIVATE_FILE_PATTERNS: ReadonlyArray<string> = [
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/*.keystore",
  "**/*.jks",
  "**/id_rsa*",
  "**/id_dsa*",
  "**/id_ecdsa*",
  "**/id_ed25519*",
  "**/.npmrc",
  "**/.pypirc",
  "**/.netrc",
  "**/.git-credentials",
  "**/.aws/credentials",
  "**/.ssh/**",
  "**/credentials*.json",
  "**/service-account*.json",
  "**/serviceAccount*.json",
  "**/secrets.*",
  "**/*.secret",
  "**/*.secrets",
];

const PUBLIC_TEMPLATE_SUFFIX = /\.(?:example|sample|template|dist|defaults?)$/i;

export interface SessionTranscriptRedactionOptions {
  /**
   * Literal secret values to remove wherever they appear, e.g. the server's own
   * environment values for credential-named variables (`secretEnvValues`).
   */
  readonly secretValues?: ReadonlyArray<string>;
  /** Extra private-file globs, e.g. from the workspace's `.t3code-transcript-private`. */
  readonly privatePaths?: ReadonlyArray<string>;
  /** Absolute workspace root, so relative and absolute paths match the same globs. */
  readonly workspaceRoot?: string | null;
  /** Shortened to `~` everywhere (it names the local user). */
  readonly homeDir?: string | null;
}

/** Counts redactions by rule while a document is processed. */
class RedactionTally {
  readonly byRule: Record<string, number> = {};
  total = 0;

  add(rule: string, count = 1): void {
    if (count <= 0) return;
    this.byRule[rule] = (this.byRule[rule] ?? 0) + count;
    this.total += count;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A minimal glob: `**` spans directories, `*` and `?` stay inside one segment.
 * A pattern without a slash matches the basename at any depth (gitignore style).
 */
export function globToRegExp(glob: string): RegExp {
  const trimmed = glob.trim().replace(/^\.\//, "");
  const anchored = trimmed.includes("/") && !trimmed.startsWith("**/");
  const body = trimmed.replace(/^\//, "");
  let source = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (char === "*") {
      if (body[index + 1] === "*") {
        const followedBySlash = body[index + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  const prefix = anchored || trimmed.startsWith("**/") ? "^" : "^(?:.*/)?";
  // A directory pattern ("secrets/") covers everything under it.
  const suffix = body.endsWith("/") ? ".*$" : "(?:/.*)?$";
  return new RegExp(`${prefix}${source}${suffix}`);
}

/** Parses a private-paths file: one glob per line, `#` comments, blank lines ignored. */
export function parsePrivatePathsFile(contents: string): string[] {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
}

export class SessionTranscriptRedactor {
  readonly tally = new RedactionTally();
  private readonly secretValues: ReadonlyArray<string>;
  private readonly privateFileMatchers: ReadonlyArray<RegExp>;
  private readonly workspaceRoot: string | null;
  private readonly homeDir: string | null;

  constructor(options: SessionTranscriptRedactionOptions = {}) {
    // Longest first, so a value that contains another is removed whole.
    this.secretValues = [...new Set(options.secretValues ?? [])]
      .filter((value) => value.trim().length >= 6)
      .sort((left, right) => right.length - left.length);
    this.privateFileMatchers = [
      ...DEFAULT_PRIVATE_FILE_PATTERNS,
      ...(options.privatePaths ?? []),
    ].map(globToRegExp);
    this.workspaceRoot = options.workspaceRoot
      ? options.workspaceRoot.replace(/\\/g, "/").replace(/\/+$/, "")
      : null;
    this.homeDir =
      options.homeDir && options.homeDir.length > 1
        ? options.homeDir.replace(/\\/g, "/").replace(/\/+$/, "")
        : null;
  }

  /** Removes credentials from free text (messages, commands, outputs, diffs). */
  text(input: string): string {
    let output = input;
    for (const value of this.secretValues) {
      if (!output.includes(value)) continue;
      const parts = output.split(value);
      this.tally.add("secret-value", parts.length - 1);
      output = parts.join(REDACTED);
    }
    for (const rule of PATTERN_RULES) {
      rule.pattern.lastIndex = 0;
      let count = 0;
      output = output.replace(rule.pattern, (...args: unknown[]) => {
        count += 1;
        // Expand $1/$2 against this match's groups.
        return rule.replace.replace(/\$(\d)/g, (_, group: string) => {
          const captured = args[Number(group)];
          return typeof captured === "string" ? captured : "";
        });
      });
      this.tally.add(rule.name, count);
    }
    return this.shortenHome(output);
  }

  /** Like `text`, for optional fields. */
  optionalText(input: string | null | undefined): string | null {
    return input === null || input === undefined ? null : this.text(input);
  }

  /** A path for display: home shortened, credentials (e.g. in a URL path) removed. */
  path(input: string): string {
    return this.text(input);
  }

  /** True when a file's contents must not appear: a default or user-marked private path. */
  isPrivateFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    const relative =
      this.workspaceRoot && normalized.startsWith(`${this.workspaceRoot}/`)
        ? normalized.slice(this.workspaceRoot.length + 1)
        : normalized.replace(/^\/+/, "");
    const basename = relative.slice(relative.lastIndexOf("/") + 1);
    if (PUBLIC_TEMPLATE_SUFFIX.test(basename)) return false;
    return this.privateFileMatchers.some(
      (matcher) => matcher.test(relative) || matcher.test(normalized),
    );
  }

  /**
   * True when text (a command line, a tool's input) names a private file, so
   * whatever the command printed may be that file's contents.
   */
  mentionsPrivateFile(text: string): boolean {
    for (const token of text.split(/[\s"'`=;|&<>()]+/)) {
      if (token.length > 0 && /[./]/.test(token) && this.isPrivateFile(token)) return true;
    }
    return false;
  }

  private shortenHome(input: string): string {
    if (!this.homeDir || !input.includes(this.homeDir)) return input;
    return input.split(this.homeDir).join("~");
  }
}

/**
 * The server's own credential values (`GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, …):
 * an agent that echoes its environment must not publish them.
 */
export function secretEnvValues(env: Readonly<Record<string, string | undefined>>): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.trim().length < 8) continue;
    if (SECRET_NAME_PATTERN.test(name)) values.push(value);
  }
  return values;
}
