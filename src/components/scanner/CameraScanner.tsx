import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Native BarcodeDetector (Chromium only); not in the TS DOM lib yet, so typed here.
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => Detector;
  }
}
const FORMATS = ["code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_39"];

export function CameraScanner({
  open,
  onOpenChange,
  onDetected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && !!window.BarcodeDetector;
  // Latest callback without restarting the camera on every parent render.
  const detected = useRef(onDetected);
  useEffect(() => {
    detected.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open || !supported) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    const detector = new window.BarcodeDetector!({ formats: FORMATS });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          const hits = await detector.detect(video.current).catch(() => []);
          if (hits[0]?.rawValue) detected.current(hits[0].rawValue);
          else timer = window.setTimeout(tick, 200);
        };
        tick();
      })
      .catch((e: Error) => setError(e.message));

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
      setError(null);
    };
  }, [open, supported]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("scanner.camera")}</DialogTitle>
        </DialogHeader>
        {!supported ? (
          <p className="text-sm text-muted-foreground">{t("scanner.unsupported")}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={video} className="w-full rounded-lg bg-black aspect-[4/3] object-cover" muted playsInline />
        )}
      </DialogContent>
    </Dialog>
  );
}
