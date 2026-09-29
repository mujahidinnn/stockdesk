import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedAddress } from "../../../supabase/functions/_shared/ssrf";

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local and metadata ranges", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "127.0.0.1", "169.254.169.254",
      "0.0.0.0", "100.64.0.1", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:127.0.0.1", "[::1]",
      "198.18.0.1", "64:ff9b::a00:1", "2002:a00:1::1"])
      expect(isBlockedAddress(ip), ip).toBe(true);
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "172.15.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])
      expect(isBlockedAddress(ip), ip).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  const dns = (map: Record<string, string[]>) => async (h: string) => map[h] ?? [];
  it("accepts https to a public host", async () => {
    await expect(assertPublicUrl("https://hooks.example.com/x", dns({ "hooks.example.com": ["93.184.216.34"] }))).resolves.toBeUndefined();
  });
  it("refuses http, credentials, localhost, IP literals inside and names that resolve inside", async () => {
    const r = dns({ "evil.example.com": ["93.184.216.34", "10.0.0.5"], "meta.example.com": ["169.254.169.254"] });
    for (const u of ["http://hooks.example.com", "https://u:p@hooks.example.com", "https://localhost/x", "https://127.0.0.1/x",
      "https://[::1]/x", "https://evil.example.com", "https://meta.example.com", "https://nowhere.example.com", "not a url"])
      await expect(assertPublicUrl(u, r), u).rejects.toThrow();
  });
});
