// Webhook signatures: X-StockDesk-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
// Web Crypto only, so Vitest (Node) and Deno run the same file.

const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signPayload(secret: string, body: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${body}`)}`;
}

/** What a receiver should do: recompute, compare in constant time, refuse stale timestamps. */
export async function verifySignature(secret: string, body: string, header: string, nowSeconds: number, toleranceSeconds = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  if (expected.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
