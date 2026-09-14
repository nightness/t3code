import { isNativeShell } from "../nativeShell";

// Revoking synchronously can abort the download in some browsers; give the
// browser time to open the stream first.
const REVOKE_DELAY_MS = 30_000;

function clickDownloadLink(href: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
}

async function shareFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const data: ShareData = { files: [file] };
  if (typeof navigator.share !== "function" || navigator.canShare?.(data) === false) {
    throw new Error("Saving files is not supported on this device.");
  }
  try {
    await navigator.share(data);
  } catch (error) {
    // Dismissing the share sheet is a choice, not a failure.
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  }
}

/**
 * Hands `blob` to the user as a file named `filename`. Browsers and the
 * desktop app click an `<a download>`, as before. The Capacitor iOS shell
 * drops that click: WKWebView asks the app about a `blob:` navigation, which
 * is neither the app origin nor a URL iOS can open, so Capacitor cancels it.
 * There the file goes to the system share sheet, whose "Save to Files" is the
 * download. Rejects when the shell cannot share files.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (isNativeShell()) return shareFile(blob, filename);
  const url = URL.createObjectURL(blob);
  try {
    clickDownloadLink(url, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/**
 * `saveFile` for bytes behind a URL. Outside the shell the URL itself is
 * clicked with `download`, unchanged; inside it the bytes are fetched and
 * shared, instead of Capacitor handing the URL to Safari.
 */
export async function saveFileFromUrl(url: string, filename: string): Promise<void> {
  if (!isNativeShell()) {
    clickDownloadLink(url, filename);
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The file could not be loaded (HTTP ${response.status}).`);
  await shareFile(await response.blob(), filename);
}
