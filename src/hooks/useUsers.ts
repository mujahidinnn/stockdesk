import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/lib/i18n";
import type { Role, UserWithEmail } from "@/lib/types";
import { errorMessage } from "@/lib/errorMessage";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_users_with_email");
      if (error) throw error;
      return data as UserWithEmail[];
    },
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from("m_roles").select("id, role_name, rank").order("rank");
      if (error) throw error;
      return data as Role[];
    },
  });
}

function useUserMutation<V>(fn: (v: V) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(i18n.t("common.saved"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

/** Edge functions answer { error } with a 4xx; surface that message instead of the generic one. */
async function invoke(name: string, body: object) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.error);
}

export const useUpdateUserRole = () =>
  useUserMutation(async ({ userId, roleId }: { userId: string; roleId: number | null }) => {
    const { error } = await supabase.from("profiles").update({ role_id: roleId }).eq("id", userId);
    if (error) throw error;
  });

export const useCreateUser = () =>
  useUserMutation((v: { email: string; password: string; full_name: string; role_id: number }) => invoke("create-user", v));

export const useSetUserActive = () =>
  useUserMutation(({ userId, active }: { userId: string; active: boolean }) =>
    invoke(active ? "reactivate-user" : "delete-user", { user_id: userId }),
  );
