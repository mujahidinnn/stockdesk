import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "../../../supabase/functions/_shared/signature";

describe("webhook signature", () => {
  const secret = "whsec_test";
  const body = '{"event":"stock.low"}';

  it("matches a known HMAC-SHA256", async () => {
    // printf '1700000000.{"event":"stock.low"}' | openssl dgst -sha256 -hmac whsec_test
    expect(await signPayload(secret, body, 1700000000)).toBe(
      "t=1700000000,v1=50dbdf7dbf084cf6b1eda94d1958f2abaa1d2bd1e0b1fca707aafce0868b3f96",
    );
  });

  it("verifies its own signature and rejects tampering, other secrets and stale timestamps", async () => {
    const h = await signPayload(secret, body, 1700000000);
    expect(await verifySignature(secret, body, h, 1700000100)).toBe(true);
    expect(await verifySignature(secret, body + " ", h, 1700000100)).toBe(false);
    expect(await verifySignature("whsec_other", body, h, 1700000100)).toBe(false);
    expect(await verifySignature(secret, body, h, 1700000000 + 301)).toBe(false);
    expect(await verifySignature(secret, body, "garbage", 1700000000)).toBe(false);
  });
});
