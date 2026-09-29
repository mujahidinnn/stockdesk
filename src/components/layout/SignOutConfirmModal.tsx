import { useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SignOutConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}

export function SignOutConfirmModal({
  open,
  onOpenChange,
  onConfirm,
}: SignOutConfirmModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm bg-card border-border"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center">
            <LogOut className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">
              {t("shell.signOutConfirm.title")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {t("shell.signOutConfirm.desc")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 border-border text-foreground hover:bg-secondary"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
                onOpenChange(false);
              }
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            {t("shell.signOut")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
