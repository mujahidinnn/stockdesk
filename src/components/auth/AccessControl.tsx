import { ReactNode } from "react";
import { useAuth } from "@/context/auth";

type Action = "create" | "read" | "update" | "delete";

interface AccessControlProps {
  feature: string;
  action: Action;
  children: ReactNode;
  fallback?: ReactNode;
}

export function AccessControl({
  feature,
  action,
  children,
  fallback = null,
}: AccessControlProps) {
  const { canCreate, canRead, canUpdate, canDelete } = useAuth();

  const allowed =
    action === "create"
      ? canCreate(feature)
      : action === "read"
        ? canRead(feature)
        : action === "update"
          ? canUpdate(feature)
          : canDelete(feature);

  return allowed ? <>{children}</> : <>{fallback}</>;
}
