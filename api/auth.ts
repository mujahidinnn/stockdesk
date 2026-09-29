import type { IncomingMessage, ServerResponse } from "node:http";

// Keeps the refresh token in an httpOnly cookie and hands the browser a placeholder,
// so XSS can't exfiltrate it. Must match COOKIE_REFRESH_TOKEN in client.ts.
const COOKIE_REFRESH_TOKEN = "httponly-cookie";

const COOKIE = "sb-rt";
const MAX_AGE = 60 * 60 * 24 * 30;
const ALLOWED = new Set(["/auth/v1/token", "/auth/v1/verify", "/auth/v1/logout"]);
const FORWARD_HEADERS = [
  "apikey",
  "authorization",
  "content-type",
  "x-client-info",
  "x-supabase-api-version",
];

type Req = IncomingMessage & { body?: unknown };

function cookie(value: string, maxAge: number) {
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/api/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// "null" and other unparsable origins count as cross-origin, not a 500.
function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function readCookie(req: Req) {
  const match = (req.headers.cookie ?? "").match(/(?:^|;\s*)sb-rt=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function readBody(req: Req) {
  // Vercel pre-parses JSON into req.body; the vite dev server does not.
  try {
    if (req.body !== undefined)
      return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  } catch {
    return "";
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: Req, res: ServerResponse) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return send(res, 500, { error: "Missing VITE_SUPABASE_URL" });
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  // SameSite=Strict already keeps the cookie off cross-site requests; this
  // rejects them outright.
  const origin = req.headers.origin;
  if (origin && originHost(origin) !== req.headers.host)
    return send(res, 403, { error: "Cross-origin request" });

  const path = new URL(req.url ?? "", "http://x").searchParams.get("path") ?? "";
  const upstream = new URL(path, supabaseUrl);
  if (upstream.origin !== new URL(supabaseUrl).origin || !ALLOWED.has(upstream.pathname))
    return send(res, 400, { error: "Path not allowed" });

  let body = await readBody(req);
  const isRefresh =
    upstream.pathname === "/auth/v1/token" &&
    upstream.searchParams.get("grant_type") === "refresh_token";
  if (isRefresh) {
    const refreshToken = readCookie(req);
    if (!refreshToken) {
      return send(res, 400, {
        error: "invalid_grant",
        error_description: "Refresh Token Not Found",
        code: "refresh_token_not_found",
      });
    }
    body = JSON.stringify({ refresh_token: refreshToken });
  }

  const headers: Record<string, string> = {};
  for (const h of FORWARD_HEADERS) {
    const v = req.headers[h];
    if (typeof v === "string") headers[h] = v;
  }

  const upstreamRes = await fetch(upstream, {
    method: "POST",
    headers,
    body: body || undefined,
  });
  const text = await upstreamRes.text();

  if (upstream.pathname === "/auth/v1/logout") {
    res.setHeader("Set-Cookie", cookie("", 0));
  } else if (isRefresh && upstreamRes.status >= 400 && upstreamRes.status < 500) {
    // Revoked/reused token: drop it so the next load doesn't retry it.
    res.setHeader("Set-Cookie", cookie("", 0));
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON (e.g. 204 from logout): pass through untouched.
  }
  if (upstreamRes.ok && json && typeof json.refresh_token === "string") {
    res.setHeader("Set-Cookie", cookie(json.refresh_token, MAX_AGE));
    json.refresh_token = COOKIE_REFRESH_TOKEN;
  }

  res.statusCode = upstreamRes.status;
  res.setHeader("Cache-Control", "no-store");
  const type = upstreamRes.headers.get("content-type");
  if (type) res.setHeader("Content-Type", type);
  res.end(json ? JSON.stringify(json) : text);
}
