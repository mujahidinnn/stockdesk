import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckCircle2 } from "lucide-react";

export function ListCard({ title, hint, empty, tour, children }: { title: string; hint?: string; empty: string; tour?: string; children: ReactNode[] }) {
  return (
    <div data-tour={tour} className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children.length ? <ul className="divide-y divide-border/60">{children}</ul> : <EmptyState size="sm" icon={CheckCircle2} title={empty} />}
    </div>
  );
}
