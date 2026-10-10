/**
 * The real pipeline: the publisher renders through `deno task export` in apps/transcripts and
 * the route serves the result. Opt-in (T3CODE_TRANSCRIPT_E2E=1): it needs Deno and, on a
 * cold cache, the network for the renderer's JSR dependencies.
 */
import { expect, it } from "@effect/vitest";
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http";

import type { ThreadId } from "@t3tools/contracts";
import {
  FIXTURE_SECRETS,
  makeSessionTranscriptFixtureProjection,
} from "@t3tools/shared/sessionTranscript/testFixtures";

import * as ServerConfig from "../config.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import { layerSessionTranscriptRoute } from "./http.ts";
import * as SessionTranscriptPublisher from "./SessionTranscriptPublisher.ts";

const enabled = process.env.T3CODE_TRANSCRIPT_E2E === "1";

it.layer(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-session-transcript-e2e-" }).pipe(
    Layer.provideMerge(ProcessRunner.layer),
    Layer.provideMerge(NodeServices.layer),
  ),
)("session transcript render (e2e)", (it) => {
  it.effect.skipIf(!enabled)(
    "publishes a page the route serves, with its islands and none of the secrets",
    () =>
      Effect.gen(function* () {
        const config = yield* ServerConfig.ServerConfig;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const options = {
          env: { ...process.env, T3CODE_TRANSCRIPT_BASE_URL: "https://reviewers.example" },
          homeDir: "/Users/dev",
        };
        const renderer = yield* SessionTranscriptPublisher.makeDenoExportRenderer(options);
        const publisher = yield* SessionTranscriptPublisher.make(renderer, options).pipe(
          Effect.provide(
            Layer.succeed(ProjectionStore.ProjectionStoreV2, {
              getThreadProjection: () => Effect.succeed(makeSessionTranscriptFixtureProjection()),
            } as unknown as ProjectionStore.ProjectionStoreV2["Service"]),
          ),
        );
        const workspace = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-e2e-ws-" });
        const { id, url } = yield* publisher.publish({
          threadId: "thread-transcript" as ThreadId,
          cwd: workspace,
          pullRequest: null,
        });
        expect(url).toBe(`https://reviewers.example/transcripts/${id}/`);

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
        const page = yield* client.execute(HttpClientRequest.get(`/transcripts/${id}/`));
        expect(page.status).toBe(200);
        const html = yield* page.text;
        expect(html).toContain("Add a healthz route");
        expect(html).toContain('data-dnx-strategy="interaction"');
        for (const secret of Object.values(FIXTURE_SECRETS)) expect(html).not.toContain(secret);

        // Every client asset the page names is served from the site.
        const assets = [...html.matchAll(/"(\/transcripts\/_denext\/client\/[^"]+)"/g)].map(
          (match) => match[1]!,
        );
        expect(assets.length).toBeGreaterThan(0);
        for (const asset of assets) {
          const response = yield* client.execute(HttpClientRequest.get(asset));
          expect(response.status, asset).toBe(200);
        }
      }),
    { timeout: 240_000 },
  );
});
