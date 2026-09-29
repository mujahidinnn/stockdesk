import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/Field";

/** QC result for one line: how many failed and why. Failed goods go to quarantine on posting. */
export function QcCheckPanel({
  rejected,
  reason,
  onChange,
  disabled,
}: {
  rejected: number;
  reason: string;
  onChange: (patch: { qty_rejected?: number; reject_reason?: string }) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-2">
      <Field label={t("receipts.fields.rejected")}>
        <Input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={rejected}
          disabled={disabled}
          onChange={(e) => onChange({ qty_rejected: Number(e.target.value) })}
          className="h-10"
        />
      </Field>
      <Field label={t("receipts.fields.rejectReason")}>
        <Input
          value={reason}
          disabled={disabled || rejected <= 0}
          onChange={(e) => onChange({ reject_reason: e.target.value })}
          placeholder={t("receipts.rejectPlaceholder")}
          className="h-10"
        />
      </Field>
    </div>
  );
}
