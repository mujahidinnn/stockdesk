/**
 * Tour steps keyed like guide.tours.<key>, targeting `[data-tour]` attributes.
 * `clickFirst` clicks another data-tour id first, e.g. to switch tabs.
 */
export interface TourStepConfig {
  selector: string;
  clickFirst?: string;
  /** Fixed side: an auto-picked side can flip between adjacent targets and make the step transition stumble. */
  side?: "top" | "right" | "bottom" | "left";
}

export const TOUR_STEPS: Record<string, TourStepConfig[]> = {
  "master-product": [
    { selector: "products-tabs" },
    { selector: "products-search" },
    { selector: "products-actions", side: "left" },
  ],
  "goods-receipt": [
    { selector: "receipts-actions", side: "left" },
    { selector: "receipts-search" },
    { selector: "receipts-list" },
  ],
  putaway: [{ selector: "putaway-scan" }, { selector: "putaway-list" }],
  "pick-list": [{ selector: "picking-tabs" }, { selector: "picking-actions", side: "left" }],
  dispatch: [{ selector: "dispatch-tabs" }],
  "stock-transfer": [{ selector: "transfers-tabs" }],
  "stock-opname": [{ selector: "counts-actions", side: "left" }, { selector: "counts-list" }],
  "stock-audit": [{ selector: "audit-tabs" }, { selector: "audit-filters" }],
  dashboard: [{ selector: "dashboard-stats" }, { selector: "dashboard-critical" }],
  valuation: [{ selector: "valuation-tabs" }],
  export: [{ selector: "export-reports" }, { selector: "export-params" }],
  integration: [{ selector: "integration-tabs" }, { selector: "integration-keys", side: "left" }],
  "master-warehouse": [
    { selector: "warehouses-list" },
    { selector: "warehouses-tree", side: "right" },
    { selector: "warehouses-grid", side: "left" },
  ],
  profile: [
    { selector: "profile-avatar" },
    { selector: "profile-account" },
    { selector: "profile-email" },
    { selector: "profile-personal" },
    { selector: "profile-language" },
    { selector: "profile-security" },
  ],
  notifications: [{ selector: "notification-bell" }],
  theme: [{ selector: "user-menu" }],
  logout: [{ selector: "user-menu" }],
};
