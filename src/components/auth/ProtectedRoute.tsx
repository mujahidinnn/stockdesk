import { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { LogoMark } from "@/components/brand/Logo";
import { useAuth } from "@/context/auth";
import { PendingAccessScreen } from "./PendingAccessScreen";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div role="status" aria-label="Loading StockDesk" className="flex flex-col items-center gap-3">
        <LogoMark animated className="h-10 w-auto text-primary" />
        <p className="logo-draw-text text-sm font-semibold text-foreground">
          StockDesk
        </p>
      </div>
    </div>
  );
}

interface ProtectedRouteProps {
  /** If provided, also checks if user can read this feature key (any of them, for a list) */
  featureKey?: string | string[];
  /** When given, rendered instead of <Outlet /> once access checks pass */
  children?: ReactNode;
}

export function ProtectedRoute({ featureKey, children }: ProtectedRouteProps) {
  const { user, profile, isLoading, canRead } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  // New accounts start without a role until an Admin assigns one.
  const roleless = !!profile && profile.role_id == null;
  if (roleless && !profile.is_superadmin) return <PendingAccessScreen />;

  if (featureKey && ![featureKey].flat().some(canRead)) {
    // A superadmin without an operational role lands on their own page.
    return <Navigate to={roleless ? "/superadmin" : "/403"} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
