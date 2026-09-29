import { motion } from "framer-motion";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-rose-500/5 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center space-y-6 max-w-sm"
      >
        <div className="relative mx-auto w-16 h-16">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-300 dark:bg-rose-950/60 dark:border-rose-900/40 flex items-center justify-center">
            <ShieldOff className="w-8 h-8 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="absolute inset-0 rounded-2xl bg-rose-500/20 blur-xl -z-10" />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-600 dark:text-rose-500">
            {t("errors.forbidden.badge")}
          </p>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t("errors.forbidden.title")}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("errors.forbidden.message")}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="gap-2 border-border text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t("errors.forbidden.goBack")}
          </Button>
          <Button
            onClick={() => navigate("/")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
          >
            {t("errors.forbidden.dashboard")}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
