import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarClock, History, ListChecks, MessageSquarePlus, PackageSearch, Send, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";
import { useAiPanel } from "@/components/ai/AiProvider";
import { useAiConversations } from "@/hooks/useAi";

const CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50 disabled:pointer-events-none";

export function CommandBar() {
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const { draft, setDraft, setOpen, send, sending, sendError, setConversationId, setShowHistory } = useAiPanel();
  const { data: conversations = [] } = useAiConversations();
  const off = sendError?.code === "not_configured";

  const submit = () => {
    if (!draft.trim() || sending || off) return;
    setOpen(true);
    void send(draft);
  };
  const openPanel = (history: boolean) => {
    if (!history) setConversationId(null);
    setShowHistory(history);
    setOpen(true);
  };

  // Each chip sends a ready prompt; shown only when the user can read what it asks about.
  const quick: { key: string; icon: LucideIcon; allowed: boolean }[] = [
    { key: "belowReorder", icon: AlertTriangle, allowed: canRead("dashboard") },
    { key: "expiring", icon: CalendarClock, allowed: canRead("dashboard") },
    { key: "workQueue", icon: ListChecks, allowed: canRead("dashboard") },
    { key: "stockOf", icon: PackageSearch, allowed: true },
  ];
  const pick = (key: string) => {
    setOpen(true);
    if (key === "stockOf") setDraft(t("ai.quick.stockOfPrompt"));
    else void send(t(`ai.quick.${key}Prompt`));
  };

  return (
    <div data-tour="dashboard-ai" className="glass-card rounded-xl p-3 sm:p-4 flex flex-col gap-3 border border-border transition-[border-color,box-shadow] duration-200 focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <input
          value={draft}
          disabled={off}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          placeholder={off ? t("ai.notConfigured") : t("ai.placeholder")}
          aria-label={t("ai.title")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <Button size="icon" className="h-8 w-8 shrink-0" onClick={submit}
          disabled={off || sending || !draft.trim()} aria-label={t("ai.send")}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {quick.filter((q) => q.allowed).map((q) => (
          <button key={q.key} type="button" disabled={off} onClick={() => pick(q.key)} className={CHIP}>
            <q.icon className="h-3.5 w-3.5" />
            {t(`ai.quick.${q.key}`)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {conversations.length > 0 && (
            <button type="button" onClick={() => openPanel(true)} className={CHIP}>
              <History className="h-3.5 w-3.5" />
              {t("ai.historyChip")}
            </button>
          )}
          <button type="button" onClick={() => openPanel(false)} className={CHIP}>
            <MessageSquarePlus className="h-3.5 w-3.5" />
            {t("ai.newChat")}
          </button>
        </div>
      </div>
    </div>
  );
}
