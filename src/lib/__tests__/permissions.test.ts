import { describe, expect, it } from "vitest";
import { resolvePermissions } from "../permissions";
import type { Feature, RolePermission, UserOverride } from "../types";

const features = [
  { id: 1, feature_key: "attendance" },
  { id: 2, feature_key: "overtime" },
  { id: 3, feature_key: "payroll" },
] as Feature[];

const rolePermissions = [
  {
    feature_id: 1,
    can_create: true,
    can_read: true,
    can_update: true,
    can_delete: false,
  },
  {
    feature_id: 2,
    can_create: false,
    can_read: true,
    can_update: false,
    can_delete: false,
  },
] as RolePermission[];

const override = (extra: Partial<UserOverride>) =>
  ({
    feature_id: 1,
    can_create: null,
    can_read: null,
    can_update: null,
    can_delete: null,
    is_override_active: true,
    ...extra,
  }) as UserOverride;

describe("resolvePermissions", () => {
  it("uses the role when there is no override", () => {
    const map = resolvePermissions(features, rolePermissions, []);
    expect(map.attendance).toEqual({
      can_create: true,
      can_read: true,
      can_update: true,
      can_delete: false,
    });
  });

  it("lets an active override win over the role", () => {
    const map = resolvePermissions(features, rolePermissions, [
      override({ can_delete: true, can_create: false }),
    ]);
    expect(map.attendance.can_delete).toBe(true);
    expect(map.attendance.can_create).toBe(false);
  });

  it("falls back to the role for a null field in the override", () => {
    const map = resolvePermissions(features, rolePermissions, [
      override({ can_delete: true }),
    ]);
    expect(map.attendance.can_read).toBe(true);
    expect(map.attendance.can_update).toBe(true);
  });

  it("ignores an override that is switched off", () => {
    const map = resolvePermissions(features, rolePermissions, [
      override({ can_delete: true, is_override_active: false }),
    ]);
    expect(map.attendance.can_delete).toBe(false);
  });

  it("denies a feature with no row at all", () => {
    const map = resolvePermissions(features, rolePermissions, []);
    expect(map.payroll).toEqual({
      can_create: false,
      can_read: false,
      can_update: false,
      can_delete: false,
    });
  });

  it("denies the rest when an override exists but the role has no row", () => {
    const map = resolvePermissions(features, rolePermissions, [
      override({ feature_id: 3, can_read: true }),
    ]);
    expect(map.payroll).toEqual({
      can_create: false,
      can_read: true,
      can_update: false,
      can_delete: false,
    });
  });
});
