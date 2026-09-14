import { DownloadIcon, ExternalLinkIcon } from "lucide-react";

import { saveFileFromUrl } from "../../lib/saveFile";
import { isNativeShell } from "../../nativeShell";
import { resolveExternalWebLinkHost } from "../chat/externalLinkContextMenu";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { resolveProtocolRelativeMediaUrl } from "./mediaContent";

/** Navigates directly so the browser handles video playback and downloads, without fetching bytes. */
export function OpenMediaLink(props: {
  readonly originalUrl?: string | undefined;
  readonly src?: string | null | undefined;
  readonly fileName?: string | undefined;
  readonly className?: string | undefined;
}) {
  const originalUrl =
    resolveExternalWebLinkHost(props.originalUrl) !== null ? props.originalUrl : undefined;
  const source = originalUrl ?? props.src;
  if (!source) return null;
  const url = resolveProtocolRelativeMediaUrl(source);
  let isBlob = false;
  try {
    const protocol = new URL(url).protocol;
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "blob:") return null;
    isBlob = protocol === "blob:";
  } catch {
    return null;
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      className={props.className}
      render={
        <a
          href={url}
          target={isBlob ? undefined : "_blank"}
          download={isBlob ? props.fileName || true : undefined}
          rel="noopener noreferrer"
          // WKWebView drops a blob download in the native shell; share the bytes instead.
          onClick={
            isBlob && isNativeShell()
              ? (event) => {
                  event.preventDefault();
                  void saveFileFromUrl(url, props.fileName || "video").catch((error: unknown) => {
                    toastManager.add({
                      type: "error",
                      title: "Could not save video",
                      description: error instanceof Error ? error.message : "Please try again.",
                    });
                  });
                }
              : undefined
          }
        />
      }
    >
      {isBlob ? <DownloadIcon /> : <ExternalLinkIcon />}
      {originalUrl ? "Open original" : isBlob ? "Download video" : "Open in browser"}
    </Button>
  );
}
