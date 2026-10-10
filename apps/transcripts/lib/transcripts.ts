// Reads the redacted transcript documents this export renders. The T3 server points
// TRANSCRIPTS_DIR at a directory holding only the transcripts it is publishing; without it
// the export renders the demo fixture.
import { join, resolve } from "@std/path";

import {
  parseSessionTranscript,
  SESSION_TRANSCRIPT_ID_PATTERN,
  type SessionTranscript,
} from "../../../packages/shared/src/sessionTranscript/document.ts";

export function transcriptsDir(): string {
  return resolve(Deno.cwd(), Deno.env.get("TRANSCRIPTS_DIR") ?? "fixtures");
}

export async function listTranscriptIds(): Promise<string[]> {
  const ids: string[] = [];
  const entries = await Array.fromAsync(Deno.readDir(transcriptsDir())).catch((error) => {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  });
  for (const entry of entries) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -".json".length);
    if (SESSION_TRANSCRIPT_ID_PATTERN.test(id)) ids.push(id);
  }
  return ids.sort();
}

export async function readTranscript(id: string): Promise<SessionTranscript> {
  if (!SESSION_TRANSCRIPT_ID_PATTERN.test(id)) throw new Error("invalid transcript id");
  const text = await Deno.readTextFile(join(transcriptsDir(), `${id}.json`));
  const transcript = parseSessionTranscript(JSON.parse(text));
  if (transcript.id !== id) throw new Error("transcript id does not match its file name");
  return transcript;
}
