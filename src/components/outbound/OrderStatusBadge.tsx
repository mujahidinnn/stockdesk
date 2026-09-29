import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/common/StatusBadge";

export function OrderStatusBadge({ status, ns = "orders" }: { status: string; ns?: "orders" | "picking" | "dispatch" }) {
  const { t } = useTranslation();
  return <StatusBadge status={status}>{t(`${ns}.status.${status}`)}</StatusBadge>;
}
