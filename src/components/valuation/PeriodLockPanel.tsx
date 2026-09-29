import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useAuth } from "@/context/auth";
import { useSetLockedUntil, useUpdateSettings, type Method } from "@/hooks/useFinance";
import { useSettings } from "@/hooks/useSettings";

// Latest date that may be locked.
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PeriodLockPanel() {
  const { t, i18n } = useTranslation();
  const { canUpdate, isAdmin } = useAuth();
  const { data: settings } = useSettings();
  const setLock = useSetLockedUntil();
  const update = useUpdateSettings();
  const [date, setDate] = useState("");
  // Moving the lock back reopens booked days: confirm first, Admin only.
  const [unlocking, setUnlocking] = useState<string | null | undefined>(undefined);
  const [days, setDays] = useState<string>("");
  const current = settings?.locked_until ?? null;
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" });
  const goesBack = !!date && !!current && date < current;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section data-tour="valuation-locks" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">{t("valuation.locks")}</p>
          <p className="text-xs text-muted-foreground">{t("valuation.locksHint")}</p>
        </div>
        <p className="flex items-center gap-2 text-sm">
          {current ? <Lock className="h-4 w-4 text-amber-600" /> : <LockOpen className="h-4 w-4 text-muted-foreground" />}
          {current ? t("valuation.lockedUntil", { date: label(current) }) : t("valuation.nothingLocked")}
        </p>
        {canUpdate("valuation") && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (goesBack) setUnlocking(date);
              else setLock.mutate(date, { onSuccess: () => setDate("") });
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lock-date" className="text-sm font-medium">{t("valuation.lockThrough")}</Label>
              <Input id="lock-date" type="date" max={yesterday()} className="h-10 w-44" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <Button type="submit" className="h-10" loading={setLock.isPending} disabled={!date || (goesBack && !isAdmin())}>
              {goesBack ? t("valuation.unlock") : t("valuation.lock")}
            </Button>
            {current && isAdmin() && (
              <Button type="button" variant="ghost" className="h-10" onClick={() => setUnlocking(null)}>
                {t("valuation.unlockAll")}
              </Button>
            )}
          </form>
        )}
        {goesBack && !isAdmin() && <p className="text-xs text-muted-foreground">{t("valuation.unlockAdminOnly")}</p>}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">{t("valuation.method")}</p>
          <p className="text-xs text-muted-foreground">{t("valuation.methodHint")}</p>
        </div>
        <RadioGroup
          value={settings?.valuation_method}
          disabled={!isAdmin() || update.isPending}
          onValueChange={(v) => update.mutate({ valuation_method: v as Method })}
          className="flex flex-col gap-2"
        >
          {(["fifo", "average"] as const).map((m) => (
            <Label key={m} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 font-normal">
              <RadioGroupItem value={m} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{t(`valuation.methods.${m}`)}</span>
                <span className="block text-xs text-muted-foreground">{t(`valuation.methodDesc.${m}`)}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ expiry_warning_days: Number(days) });
          }}
        >
          <Label htmlFor="expiry-days" className="text-sm font-medium">{t("valuation.expiryDays")}</Label>
          <div className="flex gap-2">
            <Input
              id="expiry-days"
              type="number"
              min={1}
              max={365}
              className="h-10 w-28"
              disabled={!isAdmin()}
              value={days || String(settings?.expiry_warning_days ?? "")}
              onChange={(e) => setDays(e.target.value)}
            />
            {isAdmin() && (
              <Button type="submit" className="h-10" loading={update.isPending} disabled={!days}>
                {t("common.save")}
              </Button>
            )}
          </div>
        </form>
        {!isAdmin() && <p className="text-xs text-muted-foreground">{t("valuation.adminOnly")}</p>}
      </section>

      <ConfirmDialog
        open={unlocking !== undefined}
        onOpenChange={(o) => !o && setUnlocking(undefined)}
        title={unlocking ? t("valuation.unlockTitle", { date: label(unlocking) }) : t("valuation.unlockAllTitle")}
        description={t("valuation.unlockBody")}
        confirmLabel={t("valuation.unlock")}
        onConfirm={() => unlocking !== undefined && setLock.mutate(unlocking, { onSuccess: () => setDate("") })}
      />
    </div>
  );
}
