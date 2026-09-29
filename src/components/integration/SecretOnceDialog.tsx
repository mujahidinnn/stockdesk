import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shows a key or secret exactly once; closing it is the last chance to copy. */
export function SecretOnceDialog({ title, value, onClose }: { title: string; value: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Dialog
      open={!!value}
      onOpenChange={(o) => {
        if (!o) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{t("integration.secretOnce")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
          <code data-testid="secret-value" className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0"
            aria-label={t("integration.copy")}
            onClick={() => value && navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => {})}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>{t("integration.stored")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
