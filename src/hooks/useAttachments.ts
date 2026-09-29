import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errorMessage";

type EntityTable = "t_goods_receipt_lines";
const BUCKET = "attachments";

export function useAttachments(entityTable: EntityTable, entityIds: number[]) {
  return useQuery({
    queryKey: ["attachments", entityTable, entityIds],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_attachments")
        .select("*")
        .eq("entity_table", entityTable)
        .in("entity_id", entityIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

/** Private bucket: files open through a short-lived signed URL. */
export async function openAttachment(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) return toast.error(errorMessage(error));
  window.open(data.signedUrl, "_blank", "noopener");
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entityTable, entityId, file }: { entityTable: EntityTable; entityId: number; file: File }) => {
      // Same limits as the bucket; checked here for a clear message before uploading.
      if (file.size > 5 * 1024 * 1024) throw new Error(i18n.t("attachments.tooLarge", { mb: 5 }));
      const path = `${entityTable}/${entityId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("t_attachments").insert({
        entity_table: entityTable,
        entity_id: entityId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments"] });
      toast.success(i18n.t("attachments.uploaded"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}
