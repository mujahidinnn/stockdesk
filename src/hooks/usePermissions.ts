import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Feature, RolePermission, UserOverride } from "@/lib/types";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errorMessage";

export function useFeatures() {
  return useQuery<Feature[]>({
    queryKey: ["features"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_features")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as Feature[];
    },
    staleTime: Infinity, // features never change at runtime
  });
}

export function useRolePermissions(roleId: number | null | undefined) {
  return useQuery<RolePermission[]>({
    queryKey: ["role-permissions", roleId],
    enabled: roleId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_role_permissions")
        .select("*, feature:m_features(*)")
        .eq("role_id", roleId!);
      if (error) throw error;
      return data as RolePermission[];
    },
  });
}

export function useUserOverrides(userId: string | null | undefined) {
  return useQuery<UserOverride[]>({
    queryKey: ["user-overrides", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_user_access_override")
        .select("*, feature:m_features(*)")
        .eq("user_id", userId!);
      if (error) throw error;
      return data as UserOverride[];
    },
  });
}

export function useUpsertUserOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<UserOverride, "id" | "feature">) => {
      const { error } = await supabase
        .from("t_user_access_override")
        .upsert(payload, { onConflict: "user_id,feature_id" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user-overrides", vars.user_id] });
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

export function useDeleteUserOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      featureId,
    }: {
      userId: string;
      featureId: number;
    }) => {
      const { error } = await supabase
        .from("t_user_access_override")
        .delete()
        .eq("user_id", userId)
        .eq("feature_id", featureId);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user-overrides", vars.userId] });
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}
