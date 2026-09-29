import { useState, FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth";
import { supabase } from "@/integrations/supabase/client";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// Public on the demo deployment only (public_demo_mode()); the seed locks their credentials.
const DEMO_ACCOUNTS = [
  { role: "admin", email: "rina@stockdesk.demo" },
  { role: "manager", email: "budi@stockdesk.demo" },
  { role: "worker", email: "agus@stockdesk.demo" },
] as const;

export default function LoginPage() {
  const { user, signIn, signInWithGoogle, isLoading } = useAuth();
  const { t } = useTranslation();

  const [params, setParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const { data: demo } = useQuery({
    queryKey: ["public-demo-mode"],
    queryFn: async () => (await supabase.rpc("public_demo_mode")).data === true,
    staleTime: Infinity,
  });

  if (!isLoading && user) return <Navigate to="/" replace />;

  if (params.get("mode") === "forgot")
    return (
      <AuthLayout>
        <ForgotPasswordForm initialEmail={email} onBack={() => setParams({})} />
      </AuthLayout>
    );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials";
      const msgLow = msg.toLowerCase();
      if (
        msgLow.includes("invalid") ||
        msgLow.includes("credentials") ||
        msgLow.includes("wrong")
      ) {
        setError(t("login.errors.invalidCredentials"));
      } else if (
        msgLow.includes("schema") ||
        msgLow.includes("database error")
      ) {
        setError(t("login.errors.authServiceError"));
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      const isNotEnabled =
        msg.toLowerCase().includes("provider is not enabled") ||
        msg.toLowerCase().includes("unsupported provider");
      setError(isNotEnabled ? t("login.errors.googleNotConfigured") : msg);
      setGoogleBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("login.welcome")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("login.tagline")}
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

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            {t("login.password")}
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10 pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              aria-label={t("login.password")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPass ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setParams({ mode: "forgot" })}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t("login.forgotPassword")}
          </button>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-rose-700 bg-rose-100 border border-rose-300 px-3 py-2 rounded-lg"
          >
            {error}
          </motion.p>
        )}

        <Button
          type="submit"
          loading={submitting}
          disabled={googleBusy || !email || !password}
          className="w-full h-10 font-semibold"
        >
          {submitting ? t("login.signingIn") : t("login.signIn")}
        </Button>

        <Button
          type="button"
          onClick={handleGoogle}
          loading={googleBusy}
          disabled={submitting}
          variant="outline"
          className="w-full h-10 gap-2.5 font-medium"
        >
          <GoogleIcon className="w-4 h-4" />
          {googleBusy ? t("login.redirecting") : t("login.continueWithGoogle")}
        </Button>
      </form>

      {demo && (
        <div data-testid="demo-accounts" className="mt-6 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold">{t("login.demoTitle")}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t("login.demoHint")}</p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            {DEMO_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                type="button"
                variant="secondary"
                className="h-auto min-w-0 flex-col items-start gap-0 px-3 py-2 text-left"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("Demo123!");
                }}
              >
                <span className="w-full truncate text-xs font-semibold">{t(`login.demoRoles.${a.role}`)}</span>
                <span className="w-full truncate text-[11px] font-normal text-muted-foreground">{a.email}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
