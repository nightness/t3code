import { ScanQrCodeIcon } from "lucide-react";
import { useState } from "react";

import {
  CAMERA_ACCESS_DENIED_MESSAGE,
  canScanPairingQrCode,
  scanPairingQrCode,
} from "../nativeQrPairing";
import { Button } from "./ui/button";

/**
 * "Scan QR code" for pairing forms. Renders nothing outside the native shell or when its
 * `T3Native` plugin cannot scan, so browser and desktop forms are unchanged. A scan hands the
 * unwrapped pairing URL to `onScanned` (the form treats it like a paste); cancelling does
 * nothing; a camera denial or failure goes to `onError` for the form's normal error UI.
 */
export function ScanPairingQrCodeButton({
  onScanned,
  onError,
  disabled = false,
  className,
}: {
  readonly onScanned: (pairingUrl: string) => void;
  readonly onError: (message: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  const [available] = useState(canScanPairingQrCode);
  const [scanning, setScanning] = useState(false);
  if (!available) return null;

  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const result = await scanPairingQrCode();
      switch (result._tag) {
        case "Scanned":
          onScanned(result.pairingUrl);
          return;
        case "Cancelled":
          return;
        case "Denied":
          onError(CAMERA_ACCESS_DENIED_MESSAGE);
          return;
        case "Failed":
          onError(result.message);
          return;
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={disabled || scanning}
      onClick={() => void scan()}
    >
      <ScanQrCodeIcon className="size-4" />
      Scan QR code
    </Button>
  );
}
