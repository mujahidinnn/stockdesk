import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { supabase, COOKIE_REFRESH_TOKEN } from "@/integrations/supabase/client";
import { resolvePermissions } from "@/lib/permissions";
import { logClientError } from "@/lib/errorLog";
import i18n from "@/lib/i18n";
import type { User, Session } from "@supabase/supabase-js";
import type {
  Profile,
  Feature,
  RolePermission,
  UserOverride,
  PermissionMap,
} from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  permissions: PermissionMap;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  canRead: (feature: string) => boolean;
  canCreate: (feature: string) => boolean;
  canUpdate: (feature: string) => boolean;
  canDelete: (feature: string) => boolean;
  hasAccess: (
    feature: string,
    action: "create" | "read" | "update" | "delete",
  ) => boolean;
  isAdmin: () => boolean;
  isSuperadmin: () => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Throws on any query error: an empty map here would read as "no access"
 * and bounce every guarded route to /403. */
async function fetchPermissions(userId: string): Promise<{
  profile: Profile | null;
  permissions: PermissionMap;
}> {
  const [
    { data: profile, error: profileError },
    { data: features, error: featuresError },
    { data: overrides, error: overridesError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, role:m_roles(*)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("m_features").select("*"),
    supabase
      .from("t_user_access_override")
      .select("*, feature:m_features(*)")
      .eq("user_id", userId),
  ]);
  const firstError = profileError ?? featuresError ?? overridesError;
  if (firstError) throw firstError;

  let rolePermissions: RolePermission[] = [];
  if (profile?.role_id) {
    const { data, error } = await supabase
      .from("t_role_permissions")
      .select("*, feature:m_features(*)")
      .eq("role_id", profile.role_id);
    if (error) throw error;
    rolePermissions = (data as RolePermission[]) ?? [];
  }

  const permissions = resolvePermissions(
    (features as Feature[]) ?? [],
    rolePermissions,
    (overrides as UserOverride[]) ?? [],
  );

  return { profile: profile as Profile | null, permissions };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [isLoading, setIsLoading] = useState(true);

  // onAuthStateChange can fire several times per sign-in; only the most
  // recently started loadProfile() may apply its result, so stale ones can't win.
  const loadGenerationRef = useRef(0);
  // Whose permissions are in state: a repeat SIGNED_IN or TOKEN_REFRESHED
  // for the same user must not blank the app.
  const loadedUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const generation = ++loadGenerationRef.current;
    try {
      let result: Awaited<ReturnType<typeof fetchPermissions>> | undefined;
      // ponytail: fixed 3 tries, 0.5s/1s backoff, enough for a transient blip.
      for (let attempt = 0; ; attempt++) {
        try {
          result = await fetchPermissions(userId);
          break;
        } catch (err) {
          if (attempt >= 2) throw err;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          if (generation !== loadGenerationRef.current) return;
        }
      }
      if (generation !== loadGenerationRef.current) return;
      const { profile: p, permissions: perms } = result;
      loadedUserIdRef.current = userId;
      setProfile(p);
      setPermissions(perms);
      const lang = p?.language_preference;
      if (lang && i18n.language !== lang) i18n.changeLanguage(lang);
    } catch (err) {
      console.error("loadProfile failed:", err);
      // Keep existing state on transient errors.
    } finally {
      if (generation === loadGenerationRef.current) setIsLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    // INITIAL_SESSION covers the initial check, so no separate getSession() (avoids double-loading).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, sess) => {
      // Recovery links land on the root (no extra redirect allow-list entry),
      // so route to the reset page before anything else renders.
      if (
        event === "PASSWORD_RECOVERY" &&
        window.location.pathname !== "/reset-password"
      ) {
        window.location.replace("/reset-password");
        return;
      }

      // Session is memory-only: try the httpOnly refresh cookie before declaring
      // signed out. Deferred because auth calls inside this callback deadlock.
      if (event === "INITIAL_SESSION" && !sess) {
        setTimeout(async () => {
          const { data } = await supabase.auth.refreshSession({
            refresh_token: COOKIE_REFRESH_TOKEN,
          });
          if (!data.session) setIsLoading(false);
        }, 0);
        return;
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user && loadedUserIdRef.current === sess.user.id) {
        // Same user already loaded: refresh only when the user may have changed.
        if (event === "USER_UPDATED") setTimeout(() => loadProfile(sess.user.id), 0);
      } else if (sess?.user) {
        // isLoading may already be false from an earlier "no session" resolve;
        // reset it so guards wait for this sign-in's permissions, not stale ones.
        setIsLoading(true);
        // Deferred so the auth listener returns quickly.
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        loadGenerationRef.current++; // invalidate any load still in flight
        loadedUserIdRef.current = null;
        setProfile(null);
        setPermissions({});
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      logClientError("auth.login", error.message, { email });
      throw error;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Memoized so context consumers don't cascade-render.
  const canRead = useCallback(
    (f: string) => permissions[f]?.can_read ?? false,
    [permissions],
  );
  const canCreate = useCallback(
    (f: string) => permissions[f]?.can_create ?? false,
    [permissions],
  );
  const canUpdate = useCallback(
    (f: string) => permissions[f]?.can_update ?? false,
    [permissions],
  );
  const canDelete = useCallback(
    (f: string) => permissions[f]?.can_delete ?? false,
    [permissions],
  );
  const isAdmin = useCallback(
    () => profile?.role?.role_name === "Admin",
    [profile],
  );
  const isSuperadmin = useCallback(
    () => profile?.is_superadmin === true,
    [profile],
  );

  const hasAccess = useCallback(
    (feature: string, action: "create" | "read" | "update" | "delete") => {
      if (action === "create") return permissions[feature]?.can_create ?? false;
      if (action === "read") return permissions[feature]?.can_read ?? false;
      if (action === "update") return permissions[feature]?.can_update ?? false;
      return permissions[feature]?.can_delete ?? false;
    },
    [permissions],
  );

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      permissions,
      isLoading,
      signIn,
      signInWithGoogle,
      signOut,
      canRead,
      canCreate,
      canUpdate,
      canDelete,
      hasAccess,
      isAdmin,
      isSuperadmin,
      refreshProfile,
    }),
    [
      user,
      session,
      profile,
      permissions,
      isLoading,
      signIn,
      signInWithGoogle,
      signOut,
      canRead,
      canCreate,
      canUpdate,
      canDelete,
      hasAccess,
      isAdmin,
      isSuperadmin,
      refreshProfile,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
