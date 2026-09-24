// Setup file for the opt-in `denext` test project (see vite.config.ts).
//
// Vite's `resolve.alias` only reaches modules Vite transforms. Dependencies
// Vitest leaves external (base-ui, zustand, tanstack, and CommonJS such as
// use-sync-external-store's shim) resolve `react` through Node itself, which
// would load real React next to denext. This hook sends those requests to the
// same denext files the aliases point at, so the whole process has one React.
import * as NodeModule from "node:module";
import * as NodeURL from "node:url";

import { DENEXT_REACT_ENTRIES } from "../vite/denextReact";

const redirects = new Map(
  Object.entries(DENEXT_REACT_ENTRIES).map(([specifier, file]) => [
    specifier,
    NodeURL.pathToFileURL(file).href,
  ]),
);

NodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = redirects.get(specifier);
    return url === undefined ? nextResolve(specifier, context) : { url, shortCircuit: true };
  },
});
