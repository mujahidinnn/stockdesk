import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import i18n from "@/lib/i18n";
import { run } from "./useOutboundMutation";
import { errorMessage } from "@/lib/errorMessage";

export type ApiKey = Omit<Tables<"t_api_keys">, "key_hash">;
export type Webhook = Tables<"t_webhooks">;
export type Delivery = Tables<"t_webhook_deliveries">;

export const API_SCOPES = ["stock:read", "products:read", "orders:write"] as const;
export const WEBHOOK_EVENTS = ["stock.low", "stock.changed", "receipt.posted", "shipment.dispatched", "count.approved", "batch.expiring"] as const;

export function useApiKeys() {
  return useQuery({
    queryKey: ["api-keys"],
    queryFn: () =>
      run(
        supabase
          .from("t_api_keys")
          .select("id, name, prefix, scopes, owner_id, expires_at, last_used_at, revoked_at, created_at, created_by")
          .order("created_at", { ascending: false }),
      ) as Promise<ApiKey[]>,
  });
}

export function useWebhooks() {
  return useQuery({
    queryKey: ["webhooks"],
    queryFn: () => run(supabase.from("t_webhooks").select("*").order("created_at", { ascending: false })),
  });
}

export function useDeliveries(webhookId: number | null) {
  return useQuery({
    queryKey: ["webhook-deliveries", webhookId],
    enabled: webhookId != null,
    refetchInterval: 15_000,
    queryFn: () =>
      run(
        supabase.from("t_webhook_deliveries").select("*").eq("webhook_id", webhookId!).order("id", { ascending: false }).limit(50),
      ),
  });
}

function useIntegrationMutation<V, R>(fn: (v: V) => Promise<R>, silent = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      ["api-keys", "webhooks", "webhook-deliveries", "sidebar-counts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      if (!silent) toast.success(i18n.t("common.saved"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

/** Resolves to the full key, which is shown once and never stored in the clear. */
export const useCreateApiKey = () =>
  useIntegrationMutation(
    (v: { name: string; scopes: string[]; ownerId: number | null; expiresAt: string | null }) =>
      run(
        supabase.rpc("create_api_key", {
          p_name: v.name,
          p_scopes: v.scopes,
          p_owner_id: v.ownerId ?? undefined,
          p_expires_at: v.expiresAt ?? undefined,
        }),
      ) as Promise<string>,
    true,
  );

export const useRevokeApiKey = () => useIntegrationMutation((id: number) => run(supabase.rpc("revoke_api_key", { p_id: id })));

export const useCreateWebhook = () =>
  useIntegrationMutation(
    (v: { url: string; events: string[] }) =>
      run(supabase.rpc("create_webhook", { p_url: v.url, p_events: v.events })) as Promise<{ id: number; secret: string }>,
    true,
  );

export const useRotateWebhookSecret = () =>
  useIntegrationMutation((id: number) => run(supabase.rpc("rotate_webhook_secret", { p_id: id })) as Promise<string>, true);

export const useUpdateWebhook = () =>
  useIntegrationMutation((v: { id: number; values: TablesUpdate<"t_webhooks"> }) =>
    run(supabase.from("t_webhooks").update(v.values).eq("id", v.id).select()),
  );

export const useDeleteWebhook = () => useIntegrationMutation((id: number) => run(supabase.from("t_webhooks").delete().eq("id", id).select()));

export const useRetryDelivery = () =>
  useIntegrationMutation((id: number) => run(supabase.rpc("retry_webhook_delivery", { p_id: id })));
