import { Clock, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";

/** Signed in, but no role yet: every table and RPC refuses, so there is nothing to show but this. */
export function PendingAccessScreen() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300 bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/60">
          <Clock className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold tracking-tight">{t("pending.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("pending.body", { email: user?.email ?? "" })}</p>
        </div>
        <Button variant="outline" className="h-11 gap-2" onClick={() => signOut()}>
          <LogOut className="h-4 w-4" />
          {t("pending.signOut")}
        </Button>
      </div>
    </main>
  );
}
