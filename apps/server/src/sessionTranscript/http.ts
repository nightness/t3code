/**
 * `GET /transcripts/*`: the published session transcript site.
 *
 * Unauthenticated on purpose: a transcript is linked from a pull request for reviewers who
 * have no session on this server. What protects it is that each page exists only because
 * its author opted in for that PR, and that its URL carries 128 random bits; the route
 * serves exactly the pages and the renderer's client assets, never a listing.
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import {
  resolveSessionTranscriptSitePath,
  SESSION_TRANSCRIPT_ROUTE_PREFIX,
  SESSION_TRANSCRIPTS_DIR_NAME,
  sessionTranscriptPageHeaders,
  sessionTranscriptPageWithoutSlash,
} from "./sessionTranscriptSite.ts";

const notFound = () =>
  HttpServerResponse.text("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });

/** esbuild names chunks `name-HASH8.js`; the entry and the route stylesheet are unhashed. */
const HASHED_ASSET = /-[A-Z0-9]{8}\.(?:js|css)$/;

export const layerSessionTranscriptRoute = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const siteDir = path.join(config.stateDir, SESSION_TRANSCRIPTS_DIR_NAME, "site");

    return HttpRouter.add(
      "GET",
      `${SESSION_TRANSCRIPT_ROUTE_PREFIX}/*`,
      Effect.gen(function* () {
        const url = HttpServerRequest.toURL(yield* HttpServerRequest.HttpServerRequest);
        if (Option.isNone(url)) return notFound();
        const pathname = url.value.pathname;
        const withSlash = sessionTranscriptPageWithoutSlash(pathname);
        if (withSlash) return HttpServerResponse.redirect(withSlash, { status: 308 });
        const relative = resolveSessionTranscriptSitePath(pathname);
        if (relative === null) return notFound();
        const file = path.join(siteDir, relative);

        if (relative.endsWith(".html")) {
          const html = yield* fileSystem.readFileString(file).pipe(Effect.option);
          if (Option.isNone(html)) return notFound();
          return HttpServerResponse.text(html.value, {
            contentType: "text/html; charset=utf-8",
            headers: sessionTranscriptPageHeaders(html.value),
          });
        }
        return yield* HttpServerResponse.file(file, {
          contentType: relative.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
          headers: {
            "Cache-Control": HASHED_ASSET.test(relative)
              ? "public, max-age=31536000, immutable"
              : "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        }).pipe(Effect.orElseSucceed(notFound));
      }),
    );
  }),
);
