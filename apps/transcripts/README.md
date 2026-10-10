# Session transcripts

A static page per pull request showing the T3 thread that produced it: the original prompt,
the model(s), the tools used, every turn (agent actions and the user's replies), tokens and
cost. It is a [denext](https://denext.dev) App Router app that `denext export`s redacted
transcript documents to server-rendered HTML.

## How a transcript gets published

1. **Opt in, per PR.** In the git actions menu, choose **Create PR with session transcript**
   (shown for threads the server knows). Nothing is published for a plain **Create PR**.
2. **Build and redact** (apps/server `sessionTranscript/SessionTranscriptPublisher.ts`, rules
   in `packages/shared/src/sessionTranscript/`). The server reads the thread projection and
   removes, conservatively:
   - anything shaped like a credential (GitHub, GitLab, OpenAI/Anthropic, Stripe, Slack, AWS,
     Google and npm tokens, JWTs, private keys, `Authorization` headers, `user:pass@` URLs,
     values assigned to credential-named keys, long mixed-case key material);
   - the server's own environment values for credential-named variables;
   - the contents of private files: `.env*` (not `.env.example`), keys and certificates, SSH
     and cloud credentials, `.npmrc`/`.netrc`, `secrets.*`, and any glob listed in the
     workspace's `.t3code-transcript-private` (one per line, `#` comments). A diff of such a
     file, and the output of a command or tool that reads one, are withheld entirely;
   - the author's home directory (shown as `~`).
     The page states how many items were redacted, by rule.
3. **Render.** The document is written under the server's state directory
   (`session-transcripts/documents/<id>.json`) and this app exports it
   (`deno task export` with `TRANSCRIPTS_DIR` pointing at it) into
   `session-transcripts/site/`.
4. **Link.** The PR body gets a final section: `[Session transcript](<url>) · model · turns ·
tool calls · tokens · cost`. After the PR exists the page is re-rendered with the PR's
   number and link.

A transcript that cannot be published (no Deno, no renderer, a render failure) never stops
the PR: it is created without the link and the failure is logged.

## Hosting: served by your T3 server

The page is served by the T3 server that published it, at `/transcripts/<id>/`. This needs no
new infrastructure and posts nothing anywhere: the only GitHub write is the PR body T3 was
already writing. The route is unauthenticated so reviewers without a T3 session can read it;
what protects a page is that it exists only because its author opted in, and that its id is
128 random bits. Nothing lists the transcripts, and pages are `noindex` with a strict CSP.

Links use `T3CODE_TRANSCRIPT_BASE_URL` when set (where reviewers reach this server, e.g. its
tailnet name) and the server's listening address otherwise, which only you can open.

The export is ordinary static files, so a team that wants public links can host the output
anywhere instead: `TRANSCRIPTS_DIR=<documents> TRANSCRIPTS_BASE_PATH=<path> deno task export`
and upload `out/`.

Server settings:

| Variable                         | Meaning                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `T3CODE_TRANSCRIPT_BASE_URL`     | Base URL published in PR bodies (default: the listening address) |
| `T3CODE_TRANSCRIPT_RENDERER_DIR` | This app's directory (default: found beside the server's source) |
| `T3CODE_DENO_BIN`                | The `deno` binary (default: `deno` on `PATH`)                    |

A packaged server without this app cannot render, so it creates PRs without the link.

## The page

Server Components only, rendered with T3's own stylesheet (`apps/web/src/index.css`) and its
timeline's markup, so it reads like the thread in the app. Tool calls expand with a native
`<details>` (no JavaScript). The token chart is HTML and CSS. The copy buttons are the only
island (`client:interaction`, in a `resumable` route): their code loads on the first press,
which is then replayed. A one-line inline script applies the OS light/dark theme.

Eager JavaScript is denext's delegated island loader alone, about 1.9 KB (0.9 KB gzip): every
island on the page is deferred, so the client runtime loads with the first press.

## Development

```sh
deno task fixture   # writes fixtures/demoTranscriptFixture0.json (planted secrets, redacted)
deno task export    # out/, under /transcripts
deno task test      # static checks + headless Chromium (playwright-core), if one is installed
TRANSCRIPT_SCREENSHOTS=/tmp/shots deno task test   # also writes screenshots
```

The server-side pipeline has an opt-in end-to-end test that runs this export for real:
`T3CODE_TRANSCRIPT_E2E=1 vp test run src/sessionTranscript` in apps/server.
