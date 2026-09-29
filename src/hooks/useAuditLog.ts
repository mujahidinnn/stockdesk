import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { AuditLogEntryWithActor } from "@/lib/types";

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  /** yyyy-MM-dd, local day, inclusive */
  from?: string;
  to?: string;
}

// Row triggers log "insert", the client logs "create"; same meaning.
const ACTION_ALIASES: Record<string, string[]> = {
  create: ["create", "insert"],
};

export function useAuditLog(limit = 200, filters: AuditLogFilters = {}) {
  return useQuery<AuditLogEntryWithActor[]>({
    queryKey: ["audit-log", limit, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("t_audit_log")
        .select("*, actor:profiles!t_audit_log_actor_id_fkey(id, full_name)");
      if (filters.action)
        query = query.in(
          "action",
          ACTION_ALIASES[filters.action] ?? [filters.action],
        );
      if (filters.entityType)
        query = query.eq("entity_type", filters.entityType);
      if (filters.from)
        query = query.gte(
          "created_at",
          new Date(`${filters.from}T00:00`).toISOString(),
        );
      if (filters.to)
        query = query.lt(
          "created_at",
          addDays(new Date(`${filters.to}T00:00`), 1).toISOString(),
        );
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as AuditLogEntryWithActor[];
    },
  });
}
