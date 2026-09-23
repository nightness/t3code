import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

/**
 * The web UI export the Capacitor shell pulls over the air (`T3CODE_MOBILE_UI_DIR`), served
 * by the `/api/mobile/ui/*` routes in ./http.ts. denext writes the manifest
 * (`denext ota manifest <dir>`, apps/capacitor/README.md); this module only reads it and
 * keeps denext's serving rules: serve the manifest and ONLY the files it lists, with
 * `Cache-Control: no-store` (set by the routes).
 */
export const MOBILE_UI_MANIFEST_PATH = "_denext/ota.json";

export interface MobileUiExport {
  /** The manifest as denext wrote it, or none when the feature is off. */
  readonly manifest: Effect.Effect<Option.Option<unknown>>;
  /** The absolute path of a file the current manifest lists, or none. */
  readonly resolveFile: (relativePath: string) => Effect.Effect<Option.Option<string>>;
}

const decodeManifestJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

interface LoadedManifest {
  readonly mtimeMs: number;
  readonly manifest: unknown;
  readonly paths: ReadonlySet<string>;
}

/** The listed paths of a manifest-shaped value, or undefined when it has no such shape. */
function listedPaths(value: unknown): ReadonlySet<string> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { version, files } = value as { version?: unknown; files?: unknown };
  if (typeof version !== "string" || !Array.isArray(files)) return undefined;
  const paths = new Set<string>();
  for (const file of files as ReadonlyArray<unknown>) {
    const path = typeof file === "object" && file !== null ? (file as { path?: unknown }).path : 0;
    if (typeof path !== "string") return undefined;
    paths.add(path);
  }
  return paths;
}

/** A listed path split into segments that cannot leave the export root. */
function safeSegments(relativePath: string): ReadonlyArray<string> | undefined {
  if (relativePath.includes("\\") || relativePath.includes("\0")) return undefined;
  const segments = relativePath.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..")
    ? segments
    : undefined;
}

/**
 * Reads `<dir>/_denext/ota.json` on demand and keeps it until the file's mtime changes, so a
 * re-export plus `denext ota manifest` needs no restart. An unset directory, a missing or
 * malformed manifest all read as none, which keeps the routes at 404.
 */
export const makeMobileUiExport = Effect.fn("makeMobileUiExport")(function* (
  dir: string | undefined,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cache = yield* Ref.make<LoadedManifest | undefined>(undefined);
  const root = dir === undefined ? undefined : path.resolve(dir);

  const load: Effect.Effect<LoadedManifest | undefined> = Effect.gen(function* () {
    if (root === undefined) return undefined;
    const manifestFile = path.join(root, ...MOBILE_UI_MANIFEST_PATH.split("/"));
    const info = yield* fileSystem.stat(manifestFile);
    const mtimeMs = Option.match(info.mtime, { onNone: () => -1, onSome: (d) => d.getTime() });
    const cached = yield* Ref.get(cache);
    if (cached !== undefined && cached.mtimeMs === mtimeMs) return cached;
    const manifest = yield* decodeManifestJson(yield* fileSystem.readFileString(manifestFile));
    const paths = listedPaths(manifest);
    const loaded = paths === undefined ? undefined : { mtimeMs, manifest, paths };
    yield* Ref.set(cache, loaded);
    return loaded;
  }).pipe(Effect.orElseSucceed(() => undefined));

  const resolveFile = (relativePath: string) =>
    Effect.gen(function* () {
      const loaded = yield* load;
      const segments = loaded?.paths.has(relativePath) ? safeSegments(relativePath) : undefined;
      if (root === undefined || segments === undefined) return Option.none<string>();
      // The real path must stay inside the export, so a listed file later swapped for a
      // symlink (or a symlinked parent) cannot reach anything outside it.
      const realRoot = yield* fileSystem.realPath(root);
      const real = yield* fileSystem.realPath(path.join(root, ...segments));
      return real.startsWith(`${realRoot}${path.sep}`) ? Option.some(real) : Option.none<string>();
    }).pipe(Effect.orElseSucceed(() => Option.none<string>()));

  return {
    manifest: Effect.map(load, (loaded) => Option.fromNullishOr(loaded?.manifest)),
    resolveFile,
  } satisfies MobileUiExport;
});
