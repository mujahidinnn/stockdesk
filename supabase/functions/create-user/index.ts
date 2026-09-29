import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/cors.ts";

interface CreateUserPayload {
  email: string;
  password: string;
  full_name: string;
  role_id: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    // Caller-scoped client, used only to identify the caller.
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
    const { data: allowed } = await callerClient.rpc("has_permission", { p_feature_key: "users", p_action: "create" });
    if (allowed !== true) {
      return jsonResponse({ error: "Not allowed to create users" }, 403);
    }

    const payload = await readJson<CreateUserPayload>(req);
    if (
      typeof payload.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254 ||
      typeof payload.password !== "string" || payload.password.length > 72 ||
      typeof payload.full_name !== "string" || !payload.full_name.trim() || payload.full_name.length > 120 ||
      !Number.isInteger(payload.role_id)
    ) {
      return jsonResponse({ error: "email, password, full_name and role_id are required" }, 400);
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(payload.password)) {
      return jsonResponse({ error: "Password needs 8+ characters with upper case, lower case and a number" }, 400);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: roleRow } = await adminClient
      .from("m_roles")
      .select("id, rank")
      .eq("id", payload.role_id)
      .maybeSingle();
    if (!roleRow) return jsonResponse({ error: "Unknown role_id" }, 400);
    // Re-check guard_profile_role_change's rule, which service_role bypasses.
    if (roleRow.rank <= callerRank) {
      return jsonResponse({ error: "You cannot assign a role at or above your own rank" }, 403);
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.full_name },
    });
    if (createErr) return jsonResponse({ error: createErr.message }, 400);

    // handle_new_user() already inserted a default profile; patch it.
    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({
        full_name: payload.full_name.trim(),
        role_id: payload.role_id,
      })
      .eq("id", created.user.id);
    if (updateErr) {
      // Roll back the auth user to avoid an orphaned account.
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: updateErr.message }, 400);
    }

    await adminClient.from("t_audit_log").insert({
      actor_id: caller.id, action: "create", entity_type: "user",
      entity_id: created.user.id, detail: { email: created.user.email },
    });

    return jsonResponse({ id: created.user.id, email: created.user.email });
  } catch (err) {
    return errorResponse(err);
  }
});
