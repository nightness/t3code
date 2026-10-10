// Web build only (denext React Native mode, deno.json "imports"): react-native-nitro-modules
// for the WebView. Nitro hybrid objects are C++ behind JSI, which a WebView does not have; the
// package's own web build throws for every one. react-native-nitro-markdown's renderer is
// JavaScript and needs only its parser, so `MarkdownParser` is implemented here in JavaScript
// (./markdown-parser.ts); every other hybrid object throws as the package's web build does.
import { createMarkdownParser } from "./markdown-parser.ts";

const factories: Record<string, () => unknown> = {
  MarkdownParser: createMarkdownParser,
};

export const NitroModules = {
  createHybridObject<T>(name: string): T {
    const factory = factories[name];
    if (!factory) throw new Error(`Native NitroModules are not available on web (${name}).`);
    return factory() as T;
  },
  hasHybridObject(name: string): boolean {
    return name in factories;
  },
};

export function isRuntimeAlive(): boolean {
  return true;
}
