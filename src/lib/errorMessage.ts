import i18n from "@/lib/i18n";

/** Postgres/PostgREST error codes with a translated message; business-rule
 *  errors raised by the RPCs (P0001) keep their own text. */
const CODES: Record<string, string> = {
  "42501": "common.errors.forbidden",
  "23505": "common.errors.duplicate",
  "23503": "common.inUse",
  "23514": "common.errors.invalid",
  "22P02": "common.errors.invalid",
  PGRST301: "common.errors.sessionExpired",
};

export function errorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null;
  const key = err?.code ? CODES[err.code] : undefined;
  if (key) return i18n.t(key);
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) return i18n.t("common.errors.network");
  return err?.message || i18n.t("common.errors.unexpected");
}
