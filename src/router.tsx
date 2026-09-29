import { lazy, Suspense, type ReactNode } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { PageFallback } from "./components/layout/PageFallback";

// Pages are split per route: the login screen should not ship the Excel
// writer and the PDF writer along with it.
const MasterProductPage = lazy(() => import("./pages/MasterProductPage"));
const MasterWarehousePage = lazy(() => import("./pages/MasterWarehousePage"));
const GoodsReceiptPage = lazy(() => import("./pages/GoodsReceiptPage"));
const PutawayPage = lazy(() => import("./pages/PutawayPage"));
const PickListPage = lazy(() => import("./pages/PickListPage"));
const DispatchPage = lazy(() => import("./pages/DispatchPage"));
const StockTransferPage = lazy(() => import("./pages/StockTransferPage"));
const StockOpnamePage = lazy(() => import("./pages/StockOpnamePage"));
const StockAuditPage = lazy(() => import("./pages/StockAuditPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const StockValuationPage = lazy(() => import("./pages/StockValuationPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const IntegrationSettingsPage = lazy(() => import("./pages/IntegrationSettingsPage"));
const SuperadminPage = lazy(() => import("./pages/SuperadminPage"));
const ProfileSettingsPage = lazy(() => import("./pages/ProfileSettingsPage"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const ForbiddenPage = lazy(() => import("./pages/ForbiddenPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const load = (element: ReactNode) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

/** Page behind both the auth check and a feature permission. */
const guarded = (featureKey: string | string[], element: ReactNode) => (
  <ProtectedRoute featureKey={featureKey}>{load(element)}</ProtectedRoute>
);

export const routers = [
  { path: "/login", element: load(<LoginPage />) },
  { path: "/reset-password", element: load(<ResetPasswordPage />) },
  { path: "/403", element: load(<ForbiddenPage />) },

  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: guarded("dashboard", <DashboardPage />) },
          { path: "products", element: guarded("master-product", <MasterProductPage />) },
          { path: "warehouses", element: guarded("master-warehouse", <MasterWarehousePage />) },
          { path: "inbound/receipts", element: guarded("goods-receipt", <GoodsReceiptPage />) },
          { path: "inbound/putaway", element: guarded("putaway", <PutawayPage />) },
          { path: "outbound/pick-lists", element: guarded("pick-list", <PickListPage />) },
          { path: "outbound/dispatch", element: guarded("dispatch", <DispatchPage />) },
          { path: "transfers", element: guarded("stock-transfer", <StockTransferPage />) },
          { path: "opname", element: guarded("stock-opname", <StockOpnamePage />) },
          { path: "audit", element: guarded("stock-audit", <StockAuditPage />) },
          { path: "valuation", element: guarded("valuation", <StockValuationPage />) },
          { path: "export", element: guarded("export", <ExportPage />) },
          { path: "settings/integration", element: guarded(["integration", "users"], <IntegrationSettingsPage />) },
          // No featureKey: gated by is_superadmin in the sidebar and in every RPC.
          { path: "superadmin", element: load(<SuperadminPage />) },
          // No featureKey: every authenticated user manages their own profile.
          { path: "settings/profile", element: load(<ProfileSettingsPage />) },
          // No featureKey: the guide is visible to every authenticated user.
          { path: "guide", element: load(<GuidePage />) },
        ],
      },
    ],
  },

  { path: "*", element: load(<NotFound />) },
];
