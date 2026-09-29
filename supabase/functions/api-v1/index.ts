// Public REST API, server to server (no CORS). Authenticated by API key, not JWT:
//   GET  /stock?sku=&warehouse=&limit=&offset=   stock:read
//   GET  /products?updated_since=&limit=&offset= products:read
//   POST /orders  (Idempotency-Key header)        orders:write
// Every answer is { data, error } with a matching HTTP status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@4";

const ROUTES: Record<string, string> = {
  "GET /stock": "stock:read",
  "GET /products": "products:read",
  "POST /orders": "orders:write",
};
const MAX_BODY = 100_000;

const orderSchema = z.object({
  warehouse: z.string().trim().min(1).max(20),
  customer_name: z.string().trim().min(1).max(200),
  ship_to: z.string().max(500).optional(),
  reference_no: z.string().max(100).optional(),
  note: z.string().max(1000).optional(),
  lines: z
    .array(z.object({ sku: z.string().trim().min(1).max(64), qty: z.number().positive().max(1e9), uom: z.string().max(20).optional() }))
    .min(1)
    .max(200),
});

const reply = (status: number, data: unknown, error: string | null, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ data, error }), { status, headers: { "Content-Type": "application/json", ...headers } });

async function sha256Hex(text: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

function page(url: URL) {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { p_limit: limit, p_offset: offset };
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/api-v1/, "").replace(/\/$/, "") || "/";
  let keyId: number | null = null;
  let res: Response;

  try {
    res = await handle();
  } catch (e) {
    await db.from("t_error_log").insert({ source: "api-v1", message: String(e instanceof Error ? e.message : e), context: { path } });
    res = reply(500, null, "internal_error");
  }
  await db.from("t_api_request_log").insert({ api_key_id: keyId, method: req.method, path: path.slice(0, 200), status: res.status });
  return res;

  async function handle(): Promise<Response> {
    const scope = ROUTES[`${req.method} ${path}`];
    if (!scope) return reply(404, null, "not_found");
    const token = req.headers.get("authorization")?.match(/^Bearer (sd_live_[A-Za-z0-9_-]{20,64})$/)?.[1];
    if (!token) return reply(401, null, "invalid_key");

    const { data: auth, error } = await db.rpc("api_authenticate", { p_key_hash: await sha256Hex(token), p_scope: scope });
    if (error) throw error;
    keyId = auth.key_id ?? null;
    if (auth.status !== 200)
      return reply(auth.status, null, auth.error, auth.retry_after ? { "Retry-After": String(auth.retry_after) } : {});
    const owner = auth.owner_id ?? null;

    if (path === "/stock") {
      const { data, error } = await db.rpc("api_stock", {
        p_owner_id: owner,
        p_sku: url.searchParams.get("sku"),
        p_warehouse: url.searchParams.get("warehouse"),
        ...page(url),
      });
      if (error) throw error;
      return reply(200, data, null);
    }

    if (path === "/products") {
      const since = url.searchParams.get("updated_since");
      if (since && Number.isNaN(Date.parse(since))) return reply(400, null, "updated_since must be an ISO date");
      const { data, error } = await db.rpc("api_products", { p_owner_id: owner, p_updated_since: since, ...page(url) });
      if (error) throw error;
      return reply(200, data, null);
    }

    const idem = req.headers.get("idempotency-key")?.trim();
    if (!idem || idem.length > 200) return reply(400, null, "Idempotency-Key header is required (max 200 characters)");
    const raw = await req.text();
    if (raw.length > MAX_BODY) return reply(413, null, "Body larger than 100 KB");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, null, "Body is not valid JSON");
    }
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return reply(422, null, `${i.path.join(".")}: ${i.message}`);
    }
    const { data, error: rpcErr } = await db.rpc("api_create_order", {
      p_key_id: keyId,
      p_owner_id: owner,
      p_idem_key: idem,
      p_body: parsed.data,
    });
    if (rpcErr) throw rpcErr;
    return reply(data.status, data.data ?? null, data.error ?? null);
  }
});
