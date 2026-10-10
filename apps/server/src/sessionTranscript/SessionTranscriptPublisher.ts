/**
 * SessionTranscriptPublisher - publishes a thread's session transcript as a static page the
 * PR it produced links to.
 *
 * Publishing is opt-in per pull request (the `sessionTranscript` flag of a stacked git
 * action). It builds the transcript from the thread projection, redacts it
 * (@t3tools/shared/sessionTranscript/redact: credentials, the server's own secret
 * environment values, default and user-marked private files, the home directory), writes
 * the document under the server's state directory and renders it with the denext renderer
 * (apps/transcripts, `denext export`) into the site the `/transcripts/*` route serves.
 *
 * Nothing is posted anywhere: the page is served by this server, and the PR body that links
 * to it is written by the existing PR step.
 *
 * @module SessionTranscriptPublisher
 */
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as NodeOS from "node:os";
import * as NodeURL from "node:url";

import type { ThreadId } from "@t3tools/contracts";
import {
  buildSessionTranscript,
  createSessionTranscriptId,
} from "@t3tools/shared/sessionTranscript/build";
import type {
  SessionTranscript,
  SessionTranscriptPullRequest,
  SessionTranscriptTokenUsage,
} from "@t3tools/shared/sessionTranscript/document";
import { parsePrivatePathsFile, secretEnvValues } from "@t3tools/shared/sessionTranscript/redact";

import * as ServerConfig from "../config.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProcessRunner from "../processRunner.ts";
import { parseRateTable, priceUsage, type RateTable } from "../usage/usagePricing.ts";
import {
  SESSION_TRANSCRIPT_PRIVATE_PATHS_FILE,
  SESSION_TRANSCRIPT_ROUTE_PREFIX,
  SESSION_TRANSCRIPTS_DIR_NAME,
  sessionTranscriptBaseUrl,
  sessionTranscriptUrl,
} from "./sessionTranscriptSite.ts";

export class SessionTranscriptError extends Schema.TaggedError<SessionTranscriptError>()(
  "SessionTranscriptError",
  {
    operation: Schema.Literals(["load", "build", "write", "render"]),
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Session transcript ${this.operation} failed: ${this.detail}`;
  }
}

export interface SessionTranscriptPublishInput {
  readonly threadId: ThreadId;
  /** The workspace the thread ran in: its private-paths file and relative paths. */
  readonly cwd: string;
  readonly pullRequest: SessionTranscriptPullRequest | null;
  /** Re-publish an existing transcript (e.g. once its PR number is known). */
  readonly id?: string | undefined;
}

export interface SessionTranscriptPublication {
  readonly id: string;
  readonly url: string;
  readonly transcript: SessionTranscript;
}

export class SessionTranscriptPublisher extends Context.Service<
  SessionTranscriptPublisher,
  {
    readonly publish: (
      input: SessionTranscriptPublishInput,
    ) => Effect.Effect<SessionTranscriptPublication, SessionTranscriptError>;
  }
>()("t3/sessionTranscript/SessionTranscriptPublisher") {}

/** Renders one written transcript document into the served site. */
export type SessionTranscriptRenderer = (input: {
  readonly id: string;
  readonly documentPath: string;
  readonly siteDir: string;
}) => Effect.Effect<void, SessionTranscriptError>;

export interface SessionTranscriptPublisherOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly homeDir?: string;
}

const RENDER_TIMEOUT = "3 minutes";

const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const decodeJson = Schema.decodeUnknownEffect(UnknownFromJsonString);
const encodeJson = Schema.encodeEffect(UnknownFromJsonString);

/**
 * The renderer app: `T3CODE_TRANSCRIPT_RENDERER_DIR`, else apps/transcripts beside this
 * server's source (a repo checkout). A packaged server has no renderer and cannot publish.
 */
function rendererCandidates(env: SessionTranscriptPublisherOptions["env"]): string[] {
  const fromHere = (relative: string) => NodeURL.fileURLToPath(new URL(relative, import.meta.url));
  return [
    env?.T3CODE_TRANSCRIPT_RENDERER_DIR,
    // apps/server/src/sessionTranscript/ in a checkout, apps/server/dist/ when bundled.
    fromHere("../../../transcripts/"),
    fromHere("../../transcripts/"),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));
}

const renderError = (detail: string, cause?: unknown) =>
  new SessionTranscriptError({ operation: "render", detail, cause });

/**
 * `deno task export` in the renderer app over a staging directory holding only this
 * document, then the page and the client assets copied into the site. Exports share the
 * renderer's `out/`, so the publisher runs one at a time.
 */
export const makeDenoExportRenderer = Effect.fn("makeDenoExportRenderer")(function* (
  options: SessionTranscriptPublisherOptions = {},
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const runner = yield* ProcessRunner.ProcessRunner;
  const env = options.env ?? process.env;

  const findRenderer = Effect.gen(function* () {
    for (const candidate of rendererCandidates(env)) {
      const exists = yield* fileSystem
        .exists(path.join(candidate, "deno.json"))
        .pipe(Effect.orElseSucceed(() => false));
      if (exists) return candidate;
    }
    return yield* renderError(
      "the transcript renderer (apps/transcripts) was not found; set T3CODE_TRANSCRIPT_RENDERER_DIR",
    );
  });

  const renderer: SessionTranscriptRenderer = Effect.fn("SessionTranscript.render")(function* ({
    id,
    documentPath,
    siteDir,
  }) {
    const rendererDir = yield* findRenderer;
    const stageDir = path.join(path.dirname(siteDir), "stage");
    const copy = (from: string, to: string) =>
      fileSystem.makeDirectory(path.dirname(to), { recursive: true }).pipe(
        Effect.andThen(fileSystem.copyFile(from, to)),
        Effect.mapError((cause) => renderError(`could not copy ${from}`, cause)),
      );
    yield* fileSystem.remove(stageDir, { recursive: true, force: true }).pipe(Effect.ignore);
    yield* copy(documentPath, path.join(stageDir, `${id}.json`));

    const result = yield* runner
      .run({
        command: env.T3CODE_DENO_BIN?.trim() || "deno",
        args: ["task", "export"],
        cwd: rendererDir,
        env: {
          ...env,
          TRANSCRIPTS_DIR: stageDir,
          TRANSCRIPTS_BASE_PATH: SESSION_TRANSCRIPT_ROUTE_PREFIX,
          NO_COLOR: "1",
        },
        timeout: RENDER_TIMEOUT,
        outputMode: "truncate",
      })
      .pipe(Effect.mapError((cause) => renderError("could not run deno", cause)));
    if (result.timedOut || result.code !== 0) {
      return yield* renderError(
        `denext export exited ${String(result.code)}: ${result.stderr.slice(-2000)}`,
      );
    }

    const outDir = path.join(rendererDir, "out");
    yield* copy(path.join(outDir, id, "index.html"), path.join(siteDir, id, "index.html"));
    // Chunks are content-hashed, so older pages keep the ones they reference.
    const clientDir = path.join(outDir, "_denext", "client");
    const assets = yield* fileSystem
      .readDirectory(clientDir)
      .pipe(Effect.mapError((cause) => renderError("the export wrote no client assets", cause)));
    for (const asset of assets) {
      yield* copy(path.join(clientDir, asset), path.join(siteDir, "_denext", "client", asset));
    }
  });
  return renderer;
});

/** API-equivalent cost of a turn's tokens at the model's list rates; null when unknown. */
function priceTranscriptTurn(
  rates: RateTable,
  model: string,
  usage: SessionTranscriptTokenUsage,
): number | null {
  if (rates.size === 0) return null;
  const priced = priceUsage(rates, {
    model,
    totals: {
      uncachedInputTokens: Math.max(0, usage.inputTokens - usage.cachedInputTokens),
      cachedInputTokens: usage.cachedInputTokens,
      cacheCreationTokens: 0,
      outputTokens: usage.outputTokens,
      reasoningTokens: usage.reasoningTokens,
    },
    speed: "standard",
    reportedCostUsd: null,
  });
  return priced.costSource === "unpriced" ? null : priced.costUsd;
}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.fn("SessionTranscriptPublisher.make")(function* (
  renderer: SessionTranscriptRenderer,
  options: SessionTranscriptPublisherOptions = {},
) {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const store = yield* ProjectionStore.ProjectionStoreV2;
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? NodeOS.homedir();
  const rootDir = path.join(config.stateDir, SESSION_TRANSCRIPTS_DIR_NAME);
  const documentsDir = path.join(rootDir, "documents");
  const siteDir = path.join(rootDir, "site");
  const renderLock = yield* Semaphore.make(1);
  const baseUrl = sessionTranscriptBaseUrl({
    configured: env.T3CODE_TRANSCRIPT_BASE_URL,
    host: config.host,
    port: config.port,
  });

  /** The usage page's rate snapshot (UsageService keeps it fresh); none prices nothing. */
  const readRates = fileSystem
    .readFileString(path.join(config.stateDir, "usage-model-rates.json"))
    .pipe(
      Effect.flatMap(decodeJson),
      Effect.map((cache): RateTable =>
        parseRateTable(
          typeof cache === "object" && cache !== null
            ? (cache as { readonly document?: unknown }).document
            : undefined,
        ),
      ),
      Effect.orElseSucceed((): RateTable => new Map()),
    );

  const readPrivatePaths = (cwd: string) =>
    fileSystem.readFileString(path.join(cwd, SESSION_TRANSCRIPT_PRIVATE_PATHS_FILE)).pipe(
      Effect.map(parsePrivatePathsFile),
      Effect.orElseSucceed((): string[] => []),
    );

  const publish: SessionTranscriptPublisher["Service"]["publish"] = Effect.fn(
    "SessionTranscriptPublisher.publish",
  )(function* (input) {
    const projection = yield* store
      .getThreadProjection(input.threadId)
      .pipe(
        Effect.mapError(
          (cause) =>
            new SessionTranscriptError({ operation: "load", detail: "thread not readable", cause }),
        ),
      );
    const privatePaths = yield* readPrivatePaths(input.cwd);
    const rates = yield* readRates;
    const exportedAt = yield* DateTime.now;
    const id = input.id ?? createSessionTranscriptId();
    const transcript = yield* Effect.try({
      try: () =>
        buildSessionTranscript({
          id,
          projection,
          exportedAt,
          pullRequest: input.pullRequest,
          redaction: {
            secretValues: secretEnvValues(env),
            privatePaths,
            workspaceRoot: input.cwd,
            homeDir,
          },
          price: (model, usage) => priceTranscriptTurn(rates, model, usage),
        }),
      catch: (cause) =>
        new SessionTranscriptError({ operation: "build", detail: String(cause), cause }),
    });

    const documentPath = path.join(documentsDir, `${id}.json`);
    yield* fileSystem.makeDirectory(documentsDir, { recursive: true }).pipe(
      Effect.andThen(encodeJson(transcript)),
      Effect.flatMap((json) => fileSystem.writeFileString(documentPath, json)),
      Effect.mapError(
        (cause) =>
          new SessionTranscriptError({
            operation: "write",
            detail: "could not write the document",
            cause,
          }),
      ),
    );
    yield* renderLock.withPermit(renderer({ id, documentPath, siteDir }));
    return { id, url: sessionTranscriptUrl(baseUrl, id), transcript };
  });

  return SessionTranscriptPublisher.of({ publish });
});

/** The publisher rendering through `deno task export` in apps/transcripts. */
export const layer = Layer.effect(
  SessionTranscriptPublisher,
  makeDenoExportRenderer().pipe(Effect.flatMap((renderer) => make(renderer))),
);
