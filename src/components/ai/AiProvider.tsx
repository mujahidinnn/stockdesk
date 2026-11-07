import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useSendPrompt, type AiRequestError } from "@/hooks/useAi";

interface AiPanelValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  draft: string;
  setDraft: (draft: string) => void;
  conversationId: number | null;
  setConversationId: (id: number | null) => void;
  showHistory: boolean;
  setShowHistory: (show: boolean) => void;
  /** One shared send, so the bar and the panel see the same waiting and error state. */
  send: (text: string) => Promise<void>;
  stop: () => void;
  sending: boolean;
  sentText: string | null;
  sendError: AiRequestError | null;
}

const AiPanelContext = createContext<AiPanelValue | null>(null);

export function AiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [sentText, setSentText] = useState<string | null>(null);
  const { mutateAsync, isPending, error, reset, stop } = useSendPrompt();

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      reset();
      setDraft("");
      setSentText(clean);
      try {
        const res = await mutateAsync({ text: clean, conversationId });
        setConversationId(res.conversationId);
      } catch (e) {
        // The prompt is kept so it can be sent again; the error shows in sendError.
        setDraft(clean);
        const id = (e as AiRequestError).info?.conversationId;
        if (id != null) setConversationId(id);
      } finally {
        setSentText(null);
      }
    },
    [mutateAsync, reset, conversationId],
  );

  return (
    <AiPanelContext.Provider
      value={{ open, setOpen, draft, setDraft, conversationId, setConversationId, showHistory, setShowHistory,
        send, stop, sending: isPending, sentText, sendError: error }}
    >
      {children}
    </AiPanelContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAiPanel() {
  const ctx = useContext(AiPanelContext);
  if (!ctx) throw new Error("useAiPanel must be used inside <AiProvider>");
  return ctx;
}
