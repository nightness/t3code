// The index lists nothing: each transcript is reachable only through the link its author
// shared (an unguessable id), so the export never publishes a directory of them.
export const metadata = { title: "Session transcripts · T3 Code" };

export default function Index() {
  return (
    <main class="mx-auto flex max-w-(--chat-content-max-width) flex-col gap-2 px-4 py-16 text-sm">
      <h1 class="m-0 text-lg font-semibold">T3 Code session transcripts</h1>
      <p class="m-0 text-muted-foreground">
        Transcripts are published one at a time from a pull request and are only reachable through
        their link.
      </p>
    </main>
  );
}
