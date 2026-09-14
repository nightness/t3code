import { nativeT3Plugin } from "./nativeShell";

const DEEP_LINK_PAIRING_URL_PARAM = "pairingUrl";

/**
 * Pulls the pairing URL out of a scanned QR payload. A `t3code://…?pairingUrl=<encoded>`
 * deep link carries it in the `pairingUrl` parameter; anything else is returned trimmed as-is
 * so the pairing form's normal parsing decides. Copied from the React Native app's
 * `extractPairingUrlFromQrPayload` (apps/mobile/src/features/connection/pairing.ts).
 */
export function extractPairingUrlFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error("Scanned QR code did not contain a pairing URL.");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "t3code:") {
      const pairingUrl = url.searchParams.get(DEEP_LINK_PAIRING_URL_PARAM)?.trim() ?? "";
      if (pairingUrl.length > 0) {
        return pairingUrl;
      }
    }
  } catch {
    // Treat non-URL payloads as raw pairing-url text so the normal input validation can decide.
  }

  return trimmed;
}

/** True in the native shell when its `T3Native` plugin can scan QR codes. */
export function canScanPairingQrCode(): boolean {
  return typeof nativeT3Plugin()?.scanQRCode === "function";
}

export type PairingQrScanResult =
  | { readonly _tag: "Scanned"; readonly pairingUrl: string }
  | { readonly _tag: "Cancelled" }
  | { readonly _tag: "Denied" }
  | { readonly _tag: "Failed"; readonly message: string };

export const CAMERA_ACCESS_DENIED_MESSAGE =
  "Camera access is off for T3 Code. Turn it on in Settings → T3 Code → Camera to scan a pairing QR code.";

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Opens the native scanner and resolves with the unwrapped pairing URL. Never rejects. */
export async function scanPairingQrCode(): Promise<PairingQrScanResult> {
  const scan = nativeT3Plugin()?.scanQRCode;
  if (typeof scan !== "function") {
    return { _tag: "Failed", message: "QR scanning is not available on this device." };
  }
  let payload: string;
  try {
    payload = (await scan()).value;
  } catch (error) {
    const code = errorCode(error);
    if (code === "cancelled") return { _tag: "Cancelled" };
    if (code === "denied") return { _tag: "Denied" };
    return {
      _tag: "Failed",
      message: error instanceof Error && error.message ? error.message : "Could not scan.",
    };
  }
  try {
    return {
      _tag: "Scanned",
      pairingUrl: extractPairingUrlFromQrPayload(typeof payload === "string" ? payload : ""),
    };
  } catch (error) {
    return {
      _tag: "Failed",
      message: error instanceof Error ? error.message : "Scanned QR code was not recognized.",
    };
  }
}
