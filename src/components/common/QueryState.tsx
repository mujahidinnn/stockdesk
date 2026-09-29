import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errorMessage";

interface Query {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Spinner or retry panel instead of an empty modal body; a failed refetch keeps showing existing data. */
export function QueryState({ query, children }: { query: Query | Query[]; children: ReactNode }) {
  const { t } = useTranslation();
  const qs = Array.isArray(query) ? query : [query];
  const failed = qs.filter((q) => q.isError && q.data === undefined);

  if (failed.length)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-foreground">{t("common.errors.loadFailed", { reason: errorMessage(failed[0].error) })}</p>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => failed.forEach((q) => q.refetch())}>
          <RefreshCw className="h-4 w-4" />
          {t("common.retry")}
        </Button>
      </div>
    );

  if (qs.some((q) => q.isLoading))
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t("common.loading")}
      </div>
    );

  return <>{children}</>;
}
