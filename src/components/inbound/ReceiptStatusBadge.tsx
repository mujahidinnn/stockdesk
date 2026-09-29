import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/common/StatusBadge";

export function ReceiptStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <StatusBadge status={status}>{t(`receipts.status.${status}`)}</StatusBadge>;
}
