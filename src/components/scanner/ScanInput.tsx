import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CameraScanner } from "./CameraScanner";
import { cn } from "@/lib/utils";

// USB/Bluetooth scanners type the code + Enter; the camera covers phones without one.
export function ScanInput({
  onScan,
  placeholder,
  autoFocus = true,
  className,
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [camera, setCamera] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  function submit(code: string) {
    const c = code.trim();
    setValue("");
    if (c) onScan(c);
    ref.current?.focus();
  }

  return (
    <div className={cn("flex gap-2", className)}>
      <div className="relative flex-1">
        <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit(value);
            }
          }}
          placeholder={placeholder ?? t("scanner.placeholder")}
          aria-label={placeholder ?? t("scanner.placeholder")}
          inputMode="text"
          autoComplete="off"
          className="h-11 pl-9 font-mono"
        />
      </div>
      <Button type="button" variant="outline" className="h-11 w-11 p-0" onClick={() => setCamera(true)} aria-label={t("scanner.camera")} tooltip={t("scanner.camera")}>
        <Camera className="w-5 h-5" />
      </Button>
      <CameraScanner
        open={camera}
        onOpenChange={setCamera}
        onDetected={(code) => {
          setCamera(false);
          submit(code);
        }}
      />
    </div>
  );
}
