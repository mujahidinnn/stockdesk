import { useState, type FormEvent } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

// Shown inside LoginPage (/login?mode=forgot) so both views share one route and layout.
export function ForgotPasswordForm({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recovery link targets the app root (always an allowed redirect); the auth listener
  // forwards to /reset-password, so no extra URL needs allow-listing in Supabase.
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/` },
      );
      if (resetError) throw resetError;
      setSentTo(email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {sentTo ? (
        <div className="space-y-5">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("forgotPassword.sent")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("forgotPassword.sentBody", { email: sentTo })}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full h-10"
            onClick={() => setSentTo(null)}
          >
            {t("forgotPassword.resend")}
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {t("forgotPassword.title")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("forgotPassword.subtitle")}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">
                {t("login.email")}
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-10"
              />
            </div>
            {error && (
              <p className="text-xs text-rose-700 bg-rose-100 border border-rose-300 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
            <Button
              type="submit"
              loading={busy}
              disabled={!email}
              className="w-full h-10 font-semibold"
            >
              {busy ? t("forgotPassword.sending") : t("forgotPassword.send")}
            </Button>
          </form>
        </>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("forgotPassword.backToLogin")}
      </button>
    </>
  );
}
