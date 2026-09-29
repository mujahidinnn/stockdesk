import { AlertTriangle, Trash2 } from "lucide-react";
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

interface DeleteConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  isPending?: boolean;
}

export function DeleteConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending = false,
}: DeleteConfirmationModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className="max-w-sm bg-card border-border">
        <DialogHeader className="flex flex-col items-center text-center gap-3 pt-2">
          <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-300 dark:bg-rose-950/60 dark:border-rose-900/40 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold text-foreground">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogFooter className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 border-border text-foreground hover:bg-secondary"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("deleteModal.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
            onClick={onConfirm}
            loading={isPending}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {isPending ? t("deleteModal.deleting") : t("deleteModal.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
