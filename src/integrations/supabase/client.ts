import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fail loudly at startup instead of firing requests at "undefined".
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY - copy .env.example to .env",
  );
}

// Fetch calls go same-origin (proxied by vite.config.ts / vercel.json) to hide the
// Supabase host. Realtime stays direct: Vercel rewrites can't proxy WebSockets.
const SUPABASE_PROXY_PATH = "/supabase-api";

// api/auth.ts keeps the real refresh token in an httpOnly cookie and returns this
// placeholder. Must match the literal in api/auth.ts.
export const COOKIE_REFRESH_TOKEN = "httponly-cookie";
const AUTH_BFF_PATH = /^\/auth\/v1\/(token|verify|logout)(\?|$)/;

function proxiedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === "string" || input instanceof URL
      ? input.toString()
      : input.url;
  if (url.startsWith(SUPABASE_URL)) {
    const path = url.slice(SUPABASE_URL.length);
    if (AUTH_BFF_PATH.test(path)) {
      return fetch(`/api/auth?path=${encodeURIComponent(path)}`, init);
    }
    return fetch(SUPABASE_PROXY_PATH + path, init);
  }
  return fetch(input, init);
}

// Session stays in memory (restored from the cookie on reload); only the PKCE
// verifier, which must survive the Google redirect, goes to localStorage.
const memory = new Map<string, string>();
const isSessionKey = (key: string) => key.endsWith("-auth-token");
const authStorage = {
  getItem: (key: string) =>
    isSessionKey(key) ? (memory.get(key) ?? null) : localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    isSessionKey(key) ? void memory.set(key, value) : localStorage.setItem(key, value),
  removeItem: (key: string) =>
    isSessionKey(key) ? void memory.delete(key) : localStorage.removeItem(key),
};

// Purge sessions left by the old localStorage setup: they hold a real refresh token.
for (const key of Object.keys(localStorage)) {
  if (isSessionKey(key)) localStorage.removeItem(key);
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      // PKCE: Google returns a one-time code exchanged via api/auth.ts, not URL tokens.
      flowType: "pkce",
    },
    global: {
      fetch: proxiedFetch,
    },
  },
);
