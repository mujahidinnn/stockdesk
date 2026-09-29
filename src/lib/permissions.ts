import type {
  Feature,
  RolePermission,
  UserOverride,
  PermissionMap,
  FeaturePermission,
} from "./types";

const DENIED: FeaturePermission = {
  can_create: false,
  can_read: false,
  can_update: false,
  can_delete: false,
};

/** An active per-user override wins over the role permission. */
export function resolvePermissions(
  features: Feature[],
  rolePermissions: RolePermission[],
  userOverrides: UserOverride[],
): PermissionMap {
  const map: PermissionMap = {};

  for (const feature of features) {
    const rolePerm = rolePermissions.find((rp) => rp.feature_id === feature.id);
    const override = userOverrides.find(
      (ov) => ov.feature_id === feature.id && ov.is_override_active,
    );

    if (override) {
      // Null override values fall back to the role.
      const base = rolePerm ?? DENIED;
      map[feature.feature_key] = {
        can_create: override.can_create ?? base.can_create,
        can_read: override.can_read ?? base.can_read,
        can_update: override.can_update ?? base.can_update,
        can_delete: override.can_delete ?? base.can_delete,
      };
    } else if (rolePerm) {
      map[feature.feature_key] = {
        can_create: rolePerm.can_create,
        can_read: rolePerm.can_read,
        can_update: rolePerm.can_update,
        can_delete: rolePerm.can_delete,
      };
    } else {
      map[feature.feature_key] = { ...DENIED };
    }
  }

  return map;
}
