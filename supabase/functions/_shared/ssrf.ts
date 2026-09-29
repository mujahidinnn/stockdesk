// Webhook targets must be public HTTPS hosts. Every address the host
// resolves to is checked, so a DNS name pointing inside the network is refused.
// ponytail: fetch resolves again after this check (DNS rebinding window of
// milliseconds); pin the checked IP in the request if that ever matters.

function v4Blocked(ip: string): boolean {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) || // link-local and cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 198 && (b === 18 || b === 19)) || // benchmarking, used inside some clouds
    a >= 224 // multicast and reserved
  );
}

/** True for loopback, private, link-local, metadata and other non-public addresses. */
export function isBlockedAddress(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(addr)) return v4Blocked(addr);
  if (!addr.includes(":")) return true;
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return v4Blocked(mapped[1]);
  if (addr === "::" || addr === "::1") return true;
  const [first, second] = addr.split(":").map((h) => parseInt(h || "0", 16));
  return (
    (first === 0x64 && second === 0xff9b) || // 64:ff9b::/96 NAT64 reaches any IPv4
    first === 0x2002 || // 6to4 embeds an IPv4
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 || // multicast
    addr.startsWith("::ffff:") // other mapped forms
  );
}

const isIpLiteral = (host: string) => /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":");

/** Throws unless url is https and every resolved address is public. */
export async function assertPublicUrl(url: string, resolve: (host: string) => Promise<string[]>): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:") throw new Error("Only https URLs are allowed");
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) throw new Error("Blocked host");
  const addrs = isIpLiteral(host) ? [host] : await resolve(host);
  if (!addrs.length) throw new Error("Host does not resolve");
  if (addrs.some(isBlockedAddress)) throw new Error("Blocked address");
}
