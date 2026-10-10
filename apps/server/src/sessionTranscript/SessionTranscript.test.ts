import { expect, it } from "@effect/vitest";
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http";
import { describe } from "vite-plus/test";

import type { ThreadId } from "@t3tools/contracts";
import { inlineScriptHashes } from "@t3tools/shared/sessionTranscript/csp";
import { parseSessionTranscript } from "@t3tools/shared/sessionTranscript/document";
import {
  FIXTURE_SECRETS,
  makeSessionTranscriptFixtureProjection,
} from "@t3tools/shared/sessionTranscript/testFixtures";

import * as ServerConfig from "../config.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import { layerSessionTranscriptRoute } from "./http.ts";
import * as SessionTranscriptPublisher from "./SessionTranscriptPublisher.ts";
import {
  resolveSessionTranscriptSitePath,
  sessionTranscriptBaseUrl,
  sessionTranscriptPageHeaders,
  sessionTranscriptPrBodySection,
  sessionTranscriptUrl,
} from "./sessionTranscriptSite.ts";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";
const decodeJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

describe("session transcript site rules", () => {
  it("serves only transcript pages and client assets", () => {
    expect(resolveSessionTranscriptSitePath(`/transcripts/${ID}/`)).toBe(`${ID}/index.html`);
    expect(resolveSessionTranscriptSitePath(`/transcripts/${ID}/index.html`)).toBe(
      `${ID}/index.html`,
    );
    expect(resolveSessionTranscriptSitePath("/transcripts/_denext/client/flight.js")).toBe(
      "_denext/client/flight.js",
    );
    for (const pathname of [
      "/transcripts/",
      "/transcripts/index.html",
      "/transcripts/short/",
      `/transcripts/${ID}/../../documents/${ID}.json`,
      "/transcripts/_denext/client/../../stage/x.json",
      "/transcripts/%2e%2e/secrets",
      "/transcripts/_denext/client/flight.js.map",
      "/elsewhere/_denext/client/flight.js",
      "/transcripts/%E0%A4%A",
    ]) {
      expect(resolveSessionTranscriptSitePath(pathname)).toBeNull();
    }
  });

  it("allows exactly the page's inline scripts in its CSP", () => {
    const html =
      '<script>boot()</script><script type="application/json">{"x":1}</script><script type="module" src="/transcripts/_denext/client/flight.js"></script>';
    const hashes = inlineScriptHashes(html);
    expect(hashes).toEqual(["'sha256-MeZS89WlF0u+o0hCvHTBt4q1WHU+U+sJKgbdRUc36mY='"]);
    const headers = sessionTranscriptPageHeaders(html);
    expect(headers["Content-Security-Policy"]).toContain(`script-src 'self' ${hashes[0]}`);
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
  });

  it("publishes links under the configured base URL, else the listening address", () => {
    expect(
      sessionTranscriptBaseUrl({
        configured: "https://mac.tail.ts.net/",
        host: undefined,
        port: 1,
      }),
    ).toBe("https://mac.tail.ts.net");
    expect(sessionTranscriptBaseUrl({ configured: undefined, host: "0.0.0.0", port: 3773 })).toBe(
      "http://localhost:3773",
    );
    expect(sessionTranscriptBaseUrl({ configured: " ", host: "::1", port: 3773 })).toBe(
      "http://[::1]:3773",
    );
    expect(sessionTranscriptUrl("http://localhost:3773", ID)).toBe(
      `http://localhost:3773/transcripts/${ID}/`,
    );
  });

  it("summarises the transcript in the PR body section", () => {
    const section = sessionTranscriptPrBodySection(
      {
        models: ["claude-sonnet-4-5", "claude-opus-4-1"],
        totals: {
          turns: 1,
          toolCalls: 1,
          inputTokens: 1_500,
          outputTokens: 500,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          costUsd: null,
          durationMs: null,
        },
      },
      "http://x/transcripts/a/",
    );
    expect(section).toBe(
      "\n\n---\n\n[Session transcript](http://x/transcripts/a/) · claude-sonnet-4-5, claude-opus-4-1 · 1 turn · 1 tool call · 2K tokens\n",
    );
  });
});

const projectionStoreLayer = Layer.succeed(ProjectionStore.ProjectionStoreV2, {
  getThreadProjection: () => Effect.succeed(makeSessionTranscriptFixtureProjection()),
} as unknown as ProjectionStore.ProjectionStoreV2["Service"]);

it.layer(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-session-transcript-" }).pipe(
    Layer.provideMerge(NodeServices.layer),
  ),
)("SessionTranscriptPublisher", (it) => {
  it.effect("writes a redacted document, renders it and returns its URL", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-transcript-ws-" });
      yield* fileSystem.writeFileString(
        path.join(workspace, ".t3code-transcript-private"),
        "# keep the route private\napps/server/src/http.ts\n",
      );
      // The usage page's rate snapshot: $1 per million input or output tokens.
      yield* fileSystem.writeFileString(
        path.join(config.stateDir, "usage-model-rates.json"),
        encodeJson({
          fetchedAtMs: 0,
          document: {
            "claude-sonnet-4-5": {
              input_cost_per_token: 1e-6,
              output_cost_per_token: 1e-6,
              cache_read_input_token_cost: 1e-6,
              litellm_provider: "anthropic",
            },
          },
        }),
      );
      const renders: Array<{ id: string; documentPath: string; siteDir: string }> = [];
      const publisher = yield* SessionTranscriptPublisher.make(
        (input) => Effect.sync(() => renders.push(input)),
        {
          env: { MY_SERVICE_TOKEN: "env-only-opaque-value-1234", HOME: "/Users/dev" },
          homeDir: "/Users/dev",
        },
      ).pipe(Effect.provide(projectionStoreLayer));

      const publication = yield* publisher.publish({
        threadId: "thread-transcript" as ThreadId,
        cwd: workspace,
        pullRequest: null,
      });

      expect(publication.url).toBe(
        `http://localhost:${config.port}/transcripts/${publication.id}/`,
      );
      expect(renders).toHaveLength(1);
      expect(renders[0]!.siteDir).toBe(path.join(config.stateDir, "session-transcripts", "site"));
      const written = yield* fileSystem.readFileString(renders[0]!.documentPath);
      const document = parseSessionTranscript(decodeJson(written));
      expect(document.id).toBe(publication.id);
      for (const secret of Object.values(FIXTURE_SECRETS)) expect(written).not.toContain(secret);
      // The user-marked file's diff is withheld.
      expect(
        document.turns[0]!.entries.find(
          (entry) => entry.kind === "file_change" && entry.path === "apps/server/src/http.ts",
        ),
      ).toMatchObject({ withheld: true, diff: null });
      // Priced from the snapshot for the model it knows; unknown for the other.
      expect(document.turns[0]!.costUsd).toBeCloseTo((48_200 + 2_150) / 1e6, 9);
      expect(document.turns[1]!.costUsd).toBeNull();
      expect(document.totals.costUsd).toBeNull();

      // Re-publishing keeps the id and URL, so the PR body's link stays valid.
      const again = yield* publisher.publish({
        id: publication.id,
        threadId: "thread-transcript" as ThreadId,
        cwd: workspace,
        pullRequest: {
          url: "https://github.com/example/project/pull/42",
          number: 42,
          title: "Add a healthz route",
          baseBranch: "main",
          headBranch: "feature",
        },
      });
      expect(again.url).toBe(publication.url);
      expect(again.transcript.pullRequest?.number).toBe(42);
    }),
  );

  it.effect("removes the server's own credential environment values", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-transcript-ws-" });
      const projection = makeSessionTranscriptFixtureProjection();
      const leaky = {
        ...projection,
        messages: projection.messages.map((message, index) =>
          index === 0 ? { ...message, text: "use env-only-opaque-value-1234 to deploy" } : message,
        ),
      };
      const publisher = yield* SessionTranscriptPublisher.make(() => Effect.void, {
        env: { MY_SERVICE_TOKEN: "env-only-opaque-value-1234" },
        homeDir: "/Users/dev",
      }).pipe(
        Effect.provide(
          Layer.succeed(ProjectionStore.ProjectionStoreV2, {
            getThreadProjection: () => Effect.succeed(leaky),
          } as unknown as ProjectionStore.ProjectionStoreV2["Service"]),
        ),
      );
      const { transcript } = yield* publisher.publish({
        threadId: "thread-transcript" as ThreadId,
        cwd: workspace,
        pullRequest: null,
      });
      expect(transcript.prompt).toBe("use [redacted] to deploy");
    }),
  );

  it.effect("fails, without rendering, when the thread cannot be read", () =>
    Effect.gen(function* () {
      let rendered = false;
      const publisher = yield* SessionTranscriptPublisher.make(
        () =>
          Effect.sync(() => {
            rendered = true;
          }),
        { env: {} },
      ).pipe(
        Effect.provide(
          Layer.succeed(ProjectionStore.ProjectionStoreV2, {
            getThreadProjection: () => Effect.die("no such thread"),
          } as unknown as ProjectionStore.ProjectionStoreV2["Service"]),
        ),
      );
      const exit = yield* publisher
        .publish({ threadId: "missing" as ThreadId, cwd: "/tmp", pullRequest: null })
        .pipe(Effect.exit);
      expect(exit._tag).toBe("Failure");
      expect(rendered).toBe(false);
    }),
  );

  it.effect("serves published pages with their headers and nothing else", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = path.join(config.stateDir, "session-transcripts");
      const site = path.join(root, "site");
      yield* fileSystem.makeDirectory(path.join(site, ID), { recursive: true });
      yield* fileSystem.makeDirectory(path.join(site, "_denext", "client"), { recursive: true });
      yield* fileSystem.makeDirectory(path.join(root, "documents"), { recursive: true });
      const html = "<html><script>boot()</script><p>transcript</p></html>";
      yield* fileSystem.writeFileString(path.join(site, ID, "index.html"), html);
      yield* fileSystem.writeFileString(path.join(site, "_denext", "client", "flight.js"), "f()");
      yield* fileSystem.writeFileString(
        path.join(site, "_denext", "client", "CopyButton-O4TW6FHJ.js"),
        "c()",
      );
      yield* fileSystem.writeFileString(path.join(root, "documents", `${ID}.json`), "{}");

      const services = yield* Layer.build(
        HttpRouter.serve(
          layerSessionTranscriptRoute.pipe(
            Layer.provideMerge(ServerConfig.layer(config)),
            Layer.provideMerge(NodeHttpPlatform.layer),
            Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, fileSystem)),
            Layer.provideMerge(Layer.succeed(Path.Path, path)),
          ),
          { disableListenLog: true },
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest)),
      );
      const client = Context.get(services, HttpClient.HttpClient);
      const get = (pathname: string) => client.execute(HttpClientRequest.get(pathname));

      const page = yield* get(`/transcripts/${ID}/`);
      expect(page.status).toBe(200);
      expect(page.headers["content-type"]).toMatch(/^text\/html/);
      expect(page.headers["content-security-policy"]).toContain(inlineScriptHashes(html)[0]);
      expect(page.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(yield* page.text).toBe(html);

      // Without its trailing slash the page redirects (308) to itself, so relative links resolve.
      const bare = yield* get(`/transcripts/${ID}`);
      expect(bare.status).toBe(200);
      expect(yield* bare.text).toBe(html);

      const entry = yield* get("/transcripts/_denext/client/flight.js");
      expect(entry.status).toBe(200);
      expect(entry.headers["cache-control"]).toBe("no-cache");
      const chunk = yield* get("/transcripts/_denext/client/CopyButton-O4TW6FHJ.js");
      expect(chunk.headers["cache-control"]).toContain("immutable");

      for (const pathname of [
        "/transcripts/",
        `/transcripts/${"B".repeat(22)}/`,
        `/transcripts/${ID}/../../documents/${ID}.json`,
        `/transcripts/..%2fdocuments%2f${ID}.json`,
      ]) {
        expect((yield* get(pathname)).status, pathname).toBe(404);
      }
    }),
  );
});
