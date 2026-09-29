import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessControl } from "@/components/auth/AccessControl";
import { openAttachment, useUploadAttachment } from "@/hooks/useAttachments";
import type { Tables } from "@/integrations/supabase/types";

/** Photos or PDFs for one receipt line (damaged goods, delivery note). */
export function ReceiptAttachments({ lineId, files }: { lineId: number; files: Tables<"t_attachments">[] }) {
  const { t } = useTranslation();
  const upload = useUploadAttachment();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => openAttachment(f.storage_path)}
          className="max-w-40 truncate rounded-md bg-secondary px-2 py-1 text-[11px] hover:bg-secondary/70"
        >
          {f.file_name}
        </button>
      ))}
      <AccessControl feature="goods-receipt" action="create">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate({ entityTable: "t_goods_receipt_lines", entityId: lineId, file });
            e.target.value = "";
          }}
        />
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" loading={upload.isPending} onClick={() => input.current?.click()}>
          <Paperclip className="w-3.5 h-3.5" />
          {t("attachments.add")}
        </Button>
      </AccessControl>
    </div>
  );
}
