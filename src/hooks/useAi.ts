import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/lib/i18n";

export interface AiAssistantContent {
  text: string;
  choices: { label: string; reply: string }[];
  links: { path: string; label: string }[];
}
export type AiMessage =
  | { id: number; conversation_id: number; role: "assistant"; content: AiAssistantContent; created_at: string }
  | { id: number; conversation_id: number; role: "user"; content: { text: string; flags?: string[] }; created_at: string };

export interface AiConversation { id: number; title: string | null; created_at: string; updated_at: string }
export interface AiQuota { used: number; limit: number }
export interface AiSendResult {
  conversationId: number;
  message: { id: number; role: "assistant"; content: AiAssistantContent };
  quota: AiQuota | null;
}

export const AI_CONVERSATIONS_QK = ["ai-conversations"] as const;
export const aiMessagesKey = (id: number | null) => ["ai-messages", id] as const;
const AI_QUOTA_QK = ["ai-quota"] as const;
const SEND_TIMEOUT_MS = 30_000;

export function useAiConversations() {
  return useQuery<AiConversation[]>({
    queryKey: AI_CONVERSATIONS_QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("t_ai_conversations")
        .select("id, title, created_at, updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error, count } = await supabase.from("t_ai_conversations").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("Conversation not found");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AI_CONVERSATIONS_QK }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAiMessages(conversationId: number | null) {
  return useQuery<AiMessage[]>({
    queryKey: aiMessagesKey(conversationId),
    enabled: conversationId != null,
    queryFn: async () => {
      const { data, error } = await supabase.from("t_ai_messages")
        .select("id, conversation_id, role, content, created_at").eq("conversation_id", conversationId!).order("id");
      if (error) throw error;
      return data as unknown as AiMessage[];
    },
  });
}

export function useAiQuota() {
  return useQuery<AiQuota>({
    queryKey: AI_QUOTA_QK,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_quota_today");
      if (error) throw error;
      return data as unknown as AiQuota;
    },
  });
}

export type AiErrorCode = "invalid" | "too_long" | "quota" | "not_configured" | "model_busy" | "blocked" | "timeout" | "aborted" | "unknown";
const KNOWN = new Set<string>(["invalid", "too_long", "quota", "not_configured", "model_busy", "blocked"]);

export class AiRequestError extends Error {
  constructor(public code: AiErrorCode, public info: { limit?: number; conversationId?: number } = {}, message?: string) {
    super(message ?? code);
  }
}

async function toAiError(error: { context?: unknown; message: string }): Promise<AiRequestError> {
  const res = error.context instanceof Response ? error.context : null;
  const body = res ? await res.json().catch(() => null) : null;
  const code: AiErrorCode = KNOWN.has(body?.error) ? body.error : "unknown";
  return new AiRequestError(code, { limit: body?.limit, conversationId: body?.conversationId }, body?.error ?? error.message);
}

/** Posts a prompt. `stop()` aborts the wait; the request also gives up after 30 s. */
export function useSendPrompt() {
  const qc = useQueryClient();
  const ctrl = useRef<AbortController | null>(null);
  const mutation = useMutation<AiSendResult, AiRequestError, { text: string; conversationId: number | null }>({
    mutationFn: async ({ text, conversationId }) => {
      const c = new AbortController();
      ctrl.current = c;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; c.abort(); }, SEND_TIMEOUT_MS);
      const aborted = () => new AiRequestError(timedOut ? "timeout" : "aborted");
      try {
        const { data, error } = await supabase.functions.invoke<AiSendResult>("ai-command", {
          body: { text, conversationId, lang: i18n.language?.startsWith("en") ? "en" : "id" },
          signal: c.signal,
        });
        if (c.signal.aborted) throw aborted();
        if (error) throw await toAiError(error);
        return data!;
      } catch (e) {
        if (e instanceof AiRequestError) throw e;
        if (c.signal.aborted) throw aborted();
        throw new AiRequestError("unknown", {}, e instanceof Error ? e.message : String(e));
      } finally {
        clearTimeout(timer);
        if (ctrl.current === c) ctrl.current = null;
      }
    },
    onSettled: (data, error, vars) => {
      const convId = data?.conversationId ?? error?.info.conversationId ?? vars.conversationId;
      qc.invalidateQueries({ queryKey: AI_CONVERSATIONS_QK });
      qc.invalidateQueries({ queryKey: AI_QUOTA_QK });
      if (convId != null) qc.invalidateQueries({ queryKey: aiMessagesKey(convId) });
    },
  });
  const stop = useCallback(() => ctrl.current?.abort(), []);
  return { ...mutation, stop };
}
