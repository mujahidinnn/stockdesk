import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders, errorResponse, jsonResponse, readJson, safeEqual } from "../_shared/cors.ts";

// Refuses once any Admin exists, so it can't mint extra Admins later.
// A missing SEED_ADMIN_SECRET disables the endpoint rather than opening it.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SEED_SECRET = Deno.env.get("SEED_ADMIN_SECRET");

  try {
    if (!SEED_SECRET) {
      return jsonResponse({ error: "Seeding is disabled" }, 403);
    }
    if (!safeEqual(req.headers.get("X-Seed-Secret"), SEED_SECRET)) {
      return jsonResponse({ error: "Invalid seed secret" }, 403);
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { count, error: countErr } = await adminClient
      .from("profiles")
      .select("id, role:m_roles!inner(role_name)", { count: "exact", head: true })
      .eq("role.role_name", "Admin");
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      return jsonResponse({ error: "An Admin account already exists" }, 403);
    }

    const { email, password, full_name } = await readJson<{ email: unknown; password: unknown; full_name: unknown }>(req);
    if (typeof email !== "string" || typeof password !== "string" || typeof full_name !== "string" || !email || !full_name.trim()) {
      return jsonResponse({ error: "email, password and full_name are required" }, 400);
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/.test(password)) {
      return jsonResponse({ error: "Password needs 8+ characters with upper case, lower case and a number" }, 400);
    }

    const { data: adminRole, error: roleErr } = await adminClient
      .from("m_roles")
      .select("id")
      .eq("role_name", "Admin")
      .maybeSingle();
    if (roleErr || !adminRole) return jsonResponse({ error: "Admin role not seeded" }, 500);

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) return jsonResponse({ error: createErr.message }, 400);

    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({ full_name, role_id: adminRole.id })
      .eq("id", created.user.id);
    if (updateErr) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: updateErr.message }, 400);
    }

    return jsonResponse({ id: created.user.id, email: created.user.email });
  } catch (err) {
    return errorResponse(err);
  }
});
