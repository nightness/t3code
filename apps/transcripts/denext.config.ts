import type { DenextConfig } from "denext/server";

// Where the exported site is served from. The T3 server serves it at /transcripts (its own
// web app owns `/` and `/_denext`); another static host sets TRANSCRIPTS_BASE_PATH ("" for
// the host's root) before `deno task export`.
export const basePath = Deno.env.get("TRANSCRIPTS_BASE_PATH") ?? "/transcripts";

export default {
  basePath,
  // T3's own stylesheet (apps/web/src/index.css) with the utilities this app's markup uses,
  // so a transcript looks like the thread did in the app.
  tailwind: { input: "./app/tailwind.css", output: "./app/globals.css" },
} satisfies DenextConfig;
