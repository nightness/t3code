import { TranscriptPage } from "../../components/Transcript.tsx";
import { listTranscriptIds, readTranscript } from "../../lib/transcripts.ts";

// Static export: one page per transcript document in TRANSCRIPTS_DIR, nothing else.
export const dynamicParams = false;
// Resumable: the browser adopts the server HTML as-is and runs nothing on load; an island
// (a copy button) wakes on its first interaction, which is then replayed.
export const resumable = true;

export async function generateStaticParams() {
  return (await listTranscriptIds()).map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const transcript = await readTranscript(id);
  return { title: `${transcript.title} · T3 Code session` };
}

export default async function Transcript({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TranscriptPage transcript={await readTranscript(id)} />;
}
