import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../../api/auth";

process.env.VITE_SUPABASE_URL = "https://ref.supabase.co";

function call(path: string, body: object | null, cookie?: string) {
  const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), {
    method: "POST",
    url: `/api/auth?path=${encodeURIComponent(path)}`,
    headers: {
      host: "app.test",
      origin: "https://app.test",
      apikey: "k",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });
  const headers: Record<string, string> = {};
  let out = "";
  const res = {
    statusCode: 200,
    setHeader: (k: string, v: string) => void (headers[k.toLowerCase()] = v),
    end: (b?: string) => void (out = b ?? ""),
  };
  return handler(req as never, res as unknown as ServerResponse).then(() => ({
    status: res.statusCode,
    headers,
    body: out ? JSON.parse(out) : null,
  }));
}

function mockUpstream(json: object, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(json), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("api/auth", () => {
  it("moves the refresh token from the body into an httpOnly cookie", async () => {
    mockUpstream({ access_token: "at", refresh_token: "real-rt" });
    const r = await call("/auth/v1/token?grant_type=password", { email: "a", password: "b" });
    expect(r.body).toEqual({ access_token: "at", refresh_token: "httponly-cookie" });
    expect(r.headers["set-cookie"]).toMatch(/^sb-rt=real-rt;.*HttpOnly; Secure; SameSite=Strict/);
  });

  it("refreshes with the cookie, ignoring what the client sent", async () => {
    const fetchMock = mockUpstream({ access_token: "at2", refresh_token: "rt2" });
    await call("/auth/v1/token?grant_type=refresh_token", { refresh_token: "httponly-cookie" }, "sb-rt=rt1");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].body as string)).toEqual({
      refresh_token: "rt1",
    });
  });

  it("rejects refresh without a cookie and paths outside the allow list", async () => {
    const fetchMock = mockUpstream({});
    expect((await call("/auth/v1/token?grant_type=refresh_token", {})).status).toBe(400);
    expect((await call("/rest/v1/profiles", {})).status).toBe(400);
    expect((await call("//evil.test/auth/v1/token", {})).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the cookie on logout", async () => {
    mockUpstream({});
    const r = await call("/auth/v1/logout?scope=global", null, "sb-rt=rt1");
    expect(r.headers["set-cookie"]).toMatch(/^sb-rt=; .*Max-Age=0/);
  });
});
