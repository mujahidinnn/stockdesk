import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDetector } from "@/lib/barcodeDetector";

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
  const [notFound, setNotFound] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // Latest callback without restarting the camera on every parent render.
  const detected = useRef(onDetected);
  useEffect(() => {
    detected.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;

    Promise.all([getDetector(), navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })])
      .then(async ([detector, s]) => {
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
      setNotFound(false);
    };
  }, [open]);

  // Same detector as the camera, fed with a picked photo or screenshot instead of the video.
  async function scanFile(f: File | undefined) {
    if (!f) return;
    setNotFound(false);
    const bitmap = await createImageBitmap(f).catch(() => null);
    const detector = await getDetector().catch((e: Error) => (setError(e.message), null));
    const hits = bitmap && detector ? await detector.detect(bitmap).catch(() => []) : [];
    bitmap?.close();
    if (hits[0]?.rawValue) detected.current(hits[0].rawValue);
    else setNotFound(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("scanner.camera")}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={video} className="w-full rounded-lg bg-black aspect-[4/3] object-cover" muted playsInline />
        )}
        <>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void scanFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => file.current?.click()}>
              <ImageUp className="w-4 h-4" />
              {t("scanner.upload")}
            </Button>
            {notFound && <p className="text-sm text-destructive">{t("scanner.notFound")}</p>}
          </>
      </DialogContent>
    </Dialog>
  );
}
