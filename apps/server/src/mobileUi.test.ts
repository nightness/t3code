import { expect, it } from "@effect/vitest";
import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http";

import { AuthOrchestrationReadScope, AuthSessionId } from "@t3tools/contracts";
import { symlinksSupported } from "@t3tools/shared/testing/symlinks";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import * as ServerConfig from "./config.ts";
import { mobileUiRouteLayer } from "./http.ts";

const encodeMobileUiManifestJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const VALID_AUTHORIZATION = "Bearer valid-session";

// Authenticates one bearer token with the read scope; anything else is a credential error,
// which the routes answer 401 before they reveal whether the feature is on.
const authenticateHttpRequest: EnvironmentAuth.EnvironmentAuth["Service"]["authenticateHttpRequest"] =
  (request) => {
    const authorization = request.headers["authorization"];
    if (authorization === undefined) {
      return Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError({}));
    }
    if (authorization !== VALID_AUTHORIZATION) {
      return Effect.fail(new EnvironmentAuth.ServerAuthInvalidCredentialError({}));
    }
    return Effect.succeed({
      sessionId: AuthSessionId.make("mobile-ui-test"),
      subject: "mobile-ui-test",
      method: "bearer-access-token",
      scopes: [AuthOrchestrationReadScope],
    });
  };
const environmentAuthLayer = Layer.succeed(EnvironmentAuth.EnvironmentAuth, {
  authenticateHttpRequest,
} as unknown as EnvironmentAuth.EnvironmentAuth["Service"]);

// A web export as `denext ota manifest` leaves it. The server never recomputes the
// manifest, so the hashes only need the right shape. `unlisted.js` exists but is not
// listed; `linked.js` is listed but absent unless a test creates it.
const mobileUiManifest = (appSize: number) => ({
  version: "a".repeat(64),
  files: [
    { path: "_denext/client/app.js", sha256: "b".repeat(64), size: appSize },
    { path: "index.html", sha256: "c".repeat(64), size: 13 },
    { path: "linked.js", sha256: "d".repeat(64), size: 6 },
  ],
});

const makeMobileUiExportDir = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-mobile-ui-" });
  const dir = path.join(root, "export");
  yield* fileSystem.makeDirectory(path.join(dir, "_denext", "client"), { recursive: true });
  yield* fileSystem.writeFileString(path.join(dir, "index.html"), "<html></html>");
  yield* fileSystem.writeFileString(path.join(dir, "_denext", "client", "app.js"), "app()");
  yield* fileSystem.writeFileString(path.join(dir, "_denext", "client", "app.js.gz"), "gz");
  yield* fileSystem.writeFileString(path.join(dir, "unlisted.js"), "unlisted()");
  yield* fileSystem.writeFileString(
    path.join(dir, "_denext", "ota.json"),
    encodeMobileUiManifestJson(mobileUiManifest(5)),
  );
  yield* fileSystem.writeFileString(path.join(root, "secret.txt"), "secret");
  return { dir, root };
});

/** Serves only the mobile UI routes, with `mobileUiDir` set (or unset), and returns a fetcher. */
const serveMobileUi = Effect.fn("MobileUiTest.serve")(function* (mobileUiDir: string | undefined) {
  const config = yield* ServerConfig.ServerConfig;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const appLayer = mobileUiRouteLayer.pipe(
    Layer.provideMerge(ServerConfig.layer({ ...config, mobileUiDir })),
    Layer.provideMerge(environmentAuthLayer),
    Layer.provideMerge(NodeHttpPlatform.layer),
    Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, fileSystem)),
    Layer.provideMerge(Layer.succeed(Path.Path, path)),
  );
  const services = yield* Layer.build(
    HttpRouter.serve(appLayer, { disableListenLog: true }).pipe(
      // The route handlers' own requirement (they authenticate per request).
      Layer.provide(environmentAuthLayer),
      Layer.provideMerge(NodeHttpServer.layerTest),
    ),
  );
  const client = Context.get(services, HttpClient.HttpClient);
  return (pathname: string, authorization?: string) =>
    client.execute(
      HttpClientRequest.get(
        pathname,
        authorization === undefined ? undefined : { headers: { authorization } },
      ),
    );
});

it.layer(
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-mobile-ui-config-" }).pipe(
    Layer.provideMerge(NodeServices.layer),
  ),
)("mobile UI routes", (it) => {
  it.effect("serves the mobile UI manifest file and its listed files", () =>
    Effect.gen(function* () {
      const { dir } = yield* makeMobileUiExportDir;
      const fetchMobileUi = yield* serveMobileUi(dir);

      const response = yield* fetchMobileUi("/api/mobile/ui/_denext/ota.json", VALID_AUTHORIZATION);
      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(yield* response.json).toEqual(mobileUiManifest(5));

      const file = yield* fetchMobileUi(
        "/api/mobile/ui/_denext/client/app.js",
        VALID_AUTHORIZATION,
      );
      expect(file.status).toBe(200);
      expect(file.headers["cache-control"]).toBe("no-store");
      expect(file.headers["content-type"] ?? "").toMatch(/javascript/);
      expect(yield* file.text).toBe("app()");
      const index = yield* fetchMobileUi("/api/mobile/ui/index.html", VALID_AUTHORIZATION);
      expect(index.status).toBe(200);
      expect(index.headers["content-type"] ?? "").toMatch(/^text\/html/);
    }),
  );

  it.effect("re-reads the mobile UI manifest when its mtime changes", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { dir } = yield* makeMobileUiExportDir;
      const fetchMobileUi = yield* serveMobileUi(dir);
      const readManifest = fetchMobileUi(
        "/api/mobile/ui/_denext/ota.json",
        VALID_AUTHORIZATION,
      ).pipe(Effect.flatMap((response) => response.json));

      expect(yield* readManifest).toEqual(mobileUiManifest(5));
      const manifestPath = path.join(dir, "_denext", "ota.json");
      yield* fileSystem.writeFileString(
        manifestPath,
        encodeMobileUiManifestJson(mobileUiManifest(6)),
      );
      // Force a distinct mtime: two writes can land in the same timestamp tick.
      const mtime = Option.getOrThrow((yield* fileSystem.stat(manifestPath)).mtime);
      // Node takes numeric times in seconds.
      const movedMtimeSeconds = mtime.getTime() / 1000 + 60;
      yield* fileSystem.utimes(manifestPath, movedMtimeSeconds, movedMtimeSeconds);
      expect(yield* readManifest).toEqual(mobileUiManifest(6));
    }),
  );

  it.effect("serves only files listed in the mobile UI manifest", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const { dir } = yield* makeMobileUiExportDir;
      const fetchMobileUi = yield* serveMobileUi(dir);

      for (const pathname of [
        "/api/mobile/ui/_denext/client/app.js.gz",
        "/api/mobile/ui/unlisted.js",
        "/api/mobile/ui/missing.js",
        "/api/mobile/ui/_denext",
        "/api/mobile/ui/..%2Fsecret.txt",
        "/api/mobile/ui/_denext%2F..%2F..%2Fsecret.txt",
        "/api/mobile/ui/%2E%2E%2Fsecret.txt",
        "/api/mobile/ui/%2Fetc%2Fpasswd",
        `/api/mobile/ui/${encodeURIComponent(path.join(dir, "index.html"))}`,
        "/api/mobile/ui/%E0%A4%A",
        "/api/mobile/ui/linked.js",
      ]) {
        const response = yield* fetchMobileUi(pathname, VALID_AUTHORIZATION);
        expect(response.status, pathname).toBe(404);
      }
    }),
  );

  it.effect.skipIf(!symlinksSupported)(
    "refuses a listed mobile UI file that resolves outside the export",
    () =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { dir, root } = yield* makeMobileUiExportDir;
        yield* fileSystem.symlink(path.join(root, "secret.txt"), path.join(dir, "linked.js"));
        const fetchMobileUi = yield* serveMobileUi(dir);

        const response = yield* fetchMobileUi("/api/mobile/ui/linked.js", VALID_AUTHORIZATION);
        expect(response.status).toBe(404);
      }),
  );

  it.effect("requires the environment's credentials for the mobile UI routes", () =>
    Effect.gen(function* () {
      const { dir } = yield* makeMobileUiExportDir;
      const fetchMobileUi = yield* serveMobileUi(dir);

      for (const pathname of ["/api/mobile/ui/_denext/ota.json", "/api/mobile/ui/index.html"]) {
        for (const authorization of [undefined, "Bearer not-a-real-token"]) {
          const response = yield* fetchMobileUi(pathname, authorization);
          expect(response.status, pathname).toBe(401);
        }
      }
    }),
  );

  it.effect.each(["unset", "without a manifest", "with a malformed manifest", "missing"] as const)(
    "keeps the mobile UI routes off when T3CODE_MOBILE_UI_DIR is %s",
    (setting) =>
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { dir, root } = yield* makeMobileUiExportDir;
        const manifestPath = path.join(dir, "_denext", "ota.json");
        if (setting === "without a manifest") yield* fileSystem.remove(manifestPath);
        if (setting === "with a malformed manifest") {
          yield* fileSystem.writeFileString(manifestPath, "{not json");
        }
        const fetchMobileUi = yield* serveMobileUi(
          setting === "unset" ? undefined : setting === "missing" ? path.join(root, "nope") : dir,
        );
        for (const pathname of [
          "/api/mobile/ui/_denext/ota.json",
          "/api/mobile/ui/_denext/client/app.js",
        ]) {
          const response = yield* fetchMobileUi(pathname, VALID_AUTHORIZATION);
          expect(response.status, pathname).toBe(404);
        }
      }),
  );
});
