import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, Check } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Trades the mail's `token_hash` for a session on our own domain: a sender/link domain
 * mismatch gets recovery mails flagged as phishing. Legacy fragment-session links still work.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");

  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // PASSWORD_RECOVERY may fire before mount; an already-restored session covers that case.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });

    if (tokenHash) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: "recovery" })
        .then(({ error: verifyError }) => setReady(!verifyError));
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setReady((prev) => prev ?? !!data.session);
      });
    }

    return () => subscription.unsubscribe();
  }, [tokenHash]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("resetPassword.tooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.mismatch"));
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) throw updateError;
      setDone(true);
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not set password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("resetPassword.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("resetPassword.subtitle")}
          </p>
        </div>

        {ready === false ? (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-center">
              {t("resetPassword.linkExpired")}
            </p>
            <Button
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => navigate("/login", { replace: true })}
            >
              {t("resetPassword.backToLogin")}
            </Button>
          </div>
        ) : done ? (
          <p className="text-xs text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-2 rounded-lg flex items-center gap-2">
            <Check className="w-3.5 h-3.5" />
            {t("resetPassword.success")}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("resetPassword.newPassword")}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="pl-9 pr-9 bg-secondary border-border text-foreground h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("resetPassword.confirmPassword")}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="pl-9 pr-9 bg-secondary border-border text-foreground h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirm ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-700 bg-rose-100 border border-rose-300 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              loading={saving}
              disabled={ready === null}
              className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {saving ? t("resetPassword.saving") : t("resetPassword.save")}
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
