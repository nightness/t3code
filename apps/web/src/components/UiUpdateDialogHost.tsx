import { useSyncExternalStore } from "react";

import {
  applyPromptedUiUpdate,
  dismissUiUpdatePrompt,
  readUiUpdatePrompt,
  subscribeUiUpdatePrompt,
} from "../ota";
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

/**
 * The over-the-air update prompt of the native shell (../ota.ts): a full-screen blurred overlay
 * that offers to restart into a UI the app has already downloaded. An optional update can be
 * put off with "Later"; a required one can only be accepted. Neither closes on Escape or an
 * outside tap, so the choice is always explicit.
 */
export function UiUpdateDialogHost() {
  const prompt = useSyncExternalStore(
    subscribeUiUpdatePrompt,
    readUiUpdatePrompt,
    readUiUpdatePrompt,
  );
  const applying = prompt?.status === "applying";

  return (
    <AlertDialog open={prompt !== null} onOpenChange={() => {}}>
      <AlertDialogPopup bottomStickOnMobile={false}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {prompt?.required ? "Update required" : "Update available"}
          </AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">
            {prompt?.notes ??
              (prompt?.required
                ? "A new version of T3 Code is ready. Restart to keep using the app."
                : "A new version of T3 Code is ready. Restart now to use it.")}
          </AlertDialogDescription>
          {prompt?.status === "failed" && prompt.error ? (
            <p role="alert" className="text-destructive text-sm">
              Couldn't restart: {prompt.error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {prompt?.required ? null : (
            <Button variant="outline" disabled={applying} onClick={dismissUiUpdatePrompt}>
              Later
            </Button>
          )}
          <Button disabled={applying} onClick={() => void applyPromptedUiUpdate()}>
            {applying ? (
              <>
                <Spinner /> Restarting…
              </>
            ) : prompt?.status === "failed" ? (
              "Try again"
            ) : (
              "Restart now"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
