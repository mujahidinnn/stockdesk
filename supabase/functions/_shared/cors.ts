export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Thrown for a bad request; the message is safe to show. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Reads a JSON object body of at most 100 KB. */
export async function readJson<T>(req: Request, maxBytes = 100_000): Promise<T> {
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, "Request body too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Body must be a JSON object");
  return body as T;
}

/** Known errors keep their message; anything else is logged and answered generically. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return jsonResponse({ error: err.message }, err.status);
  console.error(err);
  return jsonResponse({ error: "Unexpected error" }, 500);
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string | null, b: string): boolean {
  if (a == null) return false;
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < y.length; i++) diff |= (x[i] ?? 0) ^ y[i];
  return diff === 0;
}
