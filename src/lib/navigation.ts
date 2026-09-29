import {
  LayoutDashboard,
  Package,
  Warehouse,
  PackagePlus,
  ArrowDownToLine,
  ListChecks,
  Truck,
  ArrowLeftRight,
  ClipboardCheck,
  History,
  Calculator,
  Download,
  Plug,
  ShieldCheck,
  Compass,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Omit for pages every authenticated user can reach. */
  featureKey?: string;
  /** Other features that also reveal the item (the Integration page holds the Users tab). */
  alsoFeatureKeys?: string[];
  description: string;
  /** Key in sidebar_counts() whose number shows as a badge. */
  badgeKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Shared route list - feeds the Sidebar, the command palette and the page header. */
export function useNavGroups(): NavGroup[] {
  const { t } = useTranslation();
  const { isSuperadmin } = useAuth();

  const item = (href: string, key: string, icon: LucideIcon, featureKey?: string, badgeKey?: string): NavItem => ({
    href,
    label: t(`nav.items.${key}`),
    description: t(`nav.descriptions.${key}`),
    icon,
    featureKey,
    badgeKey,
  });

  return [
    {
      label: t("nav.groups.overview"),
      items: [item("/", "dashboard", LayoutDashboard, "dashboard")],
    },
    {
      label: t("nav.groups.masterData"),
      items: [
        item("/products", "products", Package, "master-product"),
        item("/warehouses", "warehouses", Warehouse, "master-warehouse"),
      ],
    },
    {
      label: t("nav.groups.inbound"),
      items: [
        item("/inbound/receipts", "goodsReceipt", PackagePlus, "goods-receipt"),
        item("/inbound/putaway", "putaway", ArrowDownToLine, "putaway", "putaway"),
      ],
    },
    {
      label: t("nav.groups.outbound"),
      items: [
        item("/outbound/pick-lists", "pickList", ListChecks, "pick-list", "pickList"),
        item("/outbound/dispatch", "dispatch", Truck, "dispatch", "dispatch"),
      ],
    },
    {
      label: t("nav.groups.stockControl"),
      items: [
        item("/transfers", "transfer", ArrowLeftRight, "stock-transfer", "transfer"),
        item("/opname", "opname", ClipboardCheck, "stock-opname", "opname"),
        item("/audit", "audit", History, "stock-audit"),
      ],
    },
    {
      label: t("nav.groups.finance"),
      items: [
        item("/valuation", "valuation", Calculator, "valuation", "valuation"),
        item("/export", "export", Download, "export"),
        { ...item("/settings/integration", "integration", Plug, "integration", "integration"), alsoFeatureKeys: ["users"] },
        // No featureKey: gated by is_superadmin instead of role permissions.
        ...(isSuperadmin() ? [item("/superadmin", "superadmin", ShieldCheck)] : []),
      ],
    },
    {
      label: t("nav.groups.help"),
      items: [item("/guide", "guide", Compass)],
    },
  ];
}
