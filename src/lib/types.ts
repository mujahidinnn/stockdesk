export interface Role {
  id: number;
  role_name: string;
  rank: number;
}

export interface Feature {
  id: number;
  feature_name: string;
  feature_key: string;
  icon_name: string | null;
  path: string | null;
}

export interface RolePermission {
  id: number;
  role_id: number;
  feature_id: number;
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
  feature?: Feature;
}

export interface UserOverride {
  id: number;
  user_id: string;
  feature_id: number;
  can_create: boolean | null;
  can_read: boolean | null;
  can_update: boolean | null;
  can_delete: boolean | null;
  is_override_active: boolean;
  feature?: Feature;
}

export interface Profile {
  id: string;
  role_id: number | null;
  full_name: string | null;
  avatar_url: string | null;
  language_preference: string | null;
  phone_number: string | null;
  is_superadmin: boolean;
  created_at: string;
  role?: Role | null;
}

export interface FeaturePermission {
  can_create: boolean;
  can_read: boolean;
  can_update: boolean;
  can_delete: boolean;
}

export type PermissionMap = Record<string, FeaturePermission>;


export interface UserWithEmail {
  id: string;
  full_name: string | null;
  email: string;
  role_id: number | null;
  role_name: string | null;
  avatar_url: string | null;
  created_at: string;
  banned_until: string | null;
  is_superadmin: boolean;
}

export interface Notification {
  id: number;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}


export interface AuditLogEntry {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogEntryWithActor extends AuditLogEntry {
  actor: Pick<Profile, "id" | "full_name"> | null;
}

