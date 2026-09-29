import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) return jsonResponse({ error: "Invalid session" }, 401);

    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role:m_roles(role_name, rank)")
      .eq("id", caller.id)
      .maybeSingle();
    const callerRole = callerProfile?.role as { role_name?: string; rank?: number } | null;
    const callerRank = callerRole?.rank ?? Infinity;
    // Per-user overrides count too, same as the RLS rules.
    const { data: allowed } = await callerClient.rpc("has_permission", { p_feature_key: "users", p_action: "update" });
    if (allowed !== true) {
      return jsonResponse({ error: "Not allowed to reactivate users" }, 403);
    }

    const { user_id } = await readJson<{ user_id: unknown }>(req);
    if (typeof user_id !== "string" || !/^[0-9a-f-]{36}$/i.test(user_id)) return jsonResponse({ error: "user_id is required" }, 400);

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: target } = await adminClient
      .from("profiles")
      .select("is_superadmin, role:m_roles(rank)")
      .eq("id", user_id)
      .maybeSingle();
    if (!target || target.is_superadmin) {
      return jsonResponse({ error: "User not found" }, 404);
    }
    const targetRank = (target.role as { rank?: number } | null)?.rank ?? Infinity;
    if (targetRank <= callerRank) {
      return jsonResponse({ error: "You can only manage users below your own role" }, 403);
    }

    const { error } = await adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: "none",
    });
    if (error) return jsonResponse({ error: error.message }, 400);

    await adminClient.from("t_audit_log").insert({
      actor_id: caller.id, action: "update", entity_type: "user",
      entity_id: user_id, detail: { banned: false },
    });

    return jsonResponse({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
});
