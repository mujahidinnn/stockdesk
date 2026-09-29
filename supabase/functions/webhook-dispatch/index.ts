// Sends due webhook deliveries. Called every minute by pg_cron
// (dispatch_webhooks()) with X-Cron-Secret; never by users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { signPayload } from "../_shared/signature.ts";
import { assertPublicUrl } from "../_shared/ssrf.ts";
import { safeEqual } from "../_shared/cors.ts";

async function resolve(host: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      out.push(...(await Deno.resolveDns(host, type)));
    } catch {
      /* no record of this type */
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_DISPATCH_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-cron-secret"), secret)) return new Response("Forbidden", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: due, error } = await db.rpc("claim_webhook_deliveries", { p_limit: 50 });
  if (error) return new Response(error.message, { status: 500 });

  const results = await Promise.all(
    (due ?? []).map(async (d: { id: number; url: string; secret: string; event: string; payload: unknown; created_at: string }) => {
      let ok = false;
      let code: number | null = null;
      let err: string | null = null;
      try {
        await assertPublicUrl(d.url, resolve);
        const body = JSON.stringify({ id: d.id, event: d.event, created_at: d.created_at, data: d.payload });
        const res = await fetch(d.url, {
          method: "POST",
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "StockDesk-Webhook/1",
            "X-StockDesk-Event": d.event,
            "X-StockDesk-Delivery": String(d.id),
            "X-StockDesk-Signature": await signPayload(d.secret, body, Math.floor(Date.now() / 1000)),
          },
          body,
        });
        code = res.status;
        ok = res.status >= 200 && res.status < 300;
        if (!ok) err = (await res.text()).slice(0, 1024);
      } catch (e) {
        err = String(e instanceof Error ? e.message : e).slice(0, 1024);
      }
      await db.rpc("record_webhook_result", { p_id: d.id, p_ok: ok, p_status_code: code, p_error: err });
      return ok;
    }),
  );
  return new Response(JSON.stringify({ sent: results.filter(Boolean).length, failed: results.filter((r) => !r).length }), {
    headers: { "Content-Type": "application/json" },
  });
});
