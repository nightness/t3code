// Puts the exported pages' asset URLs under the base path.
//
// denext 3.4's static export writes root-absolute client URLs (`/_denext/client/…`) even
// with `basePath` set (its production server does apply it), so a site served under
// /transcripts would request its stylesheet and Flight bootstrap from the host's root. The
// chunks import each other relatively and need no change.
import { join } from "@std/path";

import { basePath } from "../denext.config.ts";

const OUT = new URL("../out/", import.meta.url).pathname;
const ASSET_URL = /(["'(])\/_denext\//g;

export function rebaseAssetUrls(html: string, base: string): string {
  return base === "" ? html : html.replace(ASSET_URL, `$1${base}/_denext/`);
}

async function* htmlFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name);
    if (entry.isDirectory && entry.name !== "_denext") yield* htmlFiles(path);
    else if (entry.isFile && entry.name.endsWith(".html")) yield path;
  }
}

if (import.meta.main) {
  let count = 0;
  for await (const file of htmlFiles(OUT)) {
    const html = await Deno.readTextFile(file);
    const rebased = rebaseAssetUrls(html, basePath);
    if (rebased !== html) {
      await Deno.writeTextFile(file, rebased);
      count += 1;
    }
  }
  console.log(`  Rebased asset URLs under "${basePath}" in ${count} page(s)`);
}
