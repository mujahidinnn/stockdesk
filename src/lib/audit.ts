import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type AuditAction = "create" | "update" | "delete";

/**
 * Fire-and-forget: RLS requires actor_id = auth.uid(), so it no-ops when logged out.
 * Never awaited, so a logging failure can't block the mutation it describes.
 */
export function logAudit(
  action: AuditAction,
  entityType: string,
  entityId: string | number,
  detail?: Record<string, Json>,
): void {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("t_audit_log")
      .insert({
        actor_id: user.id,
        action,
        entity_type: entityType,
        entity_id: String(entityId),
        detail: detail ?? null,
      })
      .then(({ error }) => {
        if (error) console.warn("Audit log write failed:", error.message);
      });
  });
}
