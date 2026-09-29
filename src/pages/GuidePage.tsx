import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  Info,
  Workflow,
  ListChecks,
  StickyNote,
  UserCog,
  Bell,
  SunMoon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useNavGroups } from "@/lib/navigation";
import { useAuth } from "@/context/auth";
import { startAppTour } from "@/lib/appTour";

interface GuideEntry {
  href: string;
  guideKey: string;
  icon: LucideIcon;
  label: string;
  description: string;
  /** Chrome elements live on every page, so no navigation before the tour. */
  skipNavigate?: boolean;
}

export default function GuidePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { canRead, profile } = useAuth();
  const navGroups = useNavGroups();

  const firstName = profile?.full_name?.split(" ")[0] ?? t("guide.defaultName");

  const pageFeatures: GuideEntry[] = navGroups
    .flatMap((g) => g.items)
    .filter((item) => item.href !== "/guide" && item.href !== "/superadmin")
    .filter((item) => !item.featureKey || canRead(item.featureKey) || !!item.alsoFeatureKeys?.some(canRead))
    .map((item) => ({
      href: item.href,
      guideKey: item.featureKey ?? item.href.slice(1),
      icon: item.icon,
      label: item.label,
      description: item.description,
    }))
    // Menus get a guide entry once their page and guide text exist.
    .filter((item) => i18n.exists(`guide.features.${item.guideKey}.purpose`));

  const extraFeatures: GuideEntry[] = [
    {
      href: "/settings/profile",
      guideKey: "profile",
      icon: UserCog,
      label: t("guide.extra.profileLabel"),
      description: t("guide.extra.profileDesc"),
    },
    {
      href: "/guide",
      guideKey: "notifications",
      icon: Bell,
      label: t("guide.extra.notificationsLabel"),
      description: t("guide.extra.notificationsDesc"),
      skipNavigate: true,
    },
    {
      href: "/guide",
      guideKey: "theme",
      icon: SunMoon,
      label: t("guide.extra.themeLabel"),
      description: t("guide.extra.themeDesc"),
      skipNavigate: true,
    },
    {
      href: "/guide",
      guideKey: "logout",
      icon: LogOut,
      label: t("guide.extra.logoutLabel"),
      description: t("guide.extra.logoutDesc"),
      skipNavigate: true,
    },
  ];

  const features = [...pageFeatures, ...extraFeatures];

  // Delay matches AppShell's ~200ms page transition.
  function handleOpen(item: GuideEntry) {
    if (item.skipNavigate) {
      startAppTour(item.guideKey);
      return;
    }
    navigate(item.href);
    // Lazy routes and async data mean a fixed delay can miss the target, so retry.
    const startedAt = Date.now();
    const tryStart = () => {
      if (startAppTour(item.guideKey) || Date.now() - startedAt > 8000) return;
      setTimeout(tryStart, 200);
    };
    setTimeout(tryStart, 400);
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center flex-shrink-0">
          <Compass className="w-6 h-6 text-white" strokeWidth={2.2} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("guide.welcomeTitle", { name: firstName })}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("guide.welcomeSubtitle")}
          </p>
        </div>
      </motion.div>

      <section aria-labelledby="role-flows" className="flex flex-col gap-2">
        <h3 id="role-flows" className="text-sm font-semibold">{t("guide.rolesTitle")}</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {(["worker", "manager", "admin"] as const).map((role) => (
            <div key={role} className="rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">{t(`guide.roles.${role}.title`)}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                {(t(`guide.roles.${role}.steps`, { returnObjects: true }) as string[]).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <Accordion type="single" collapsible className="flex flex-col gap-3">
        {features.map((item, i) => {
          const key = item.guideKey;
          const purpose = t(`guide.features.${key}.purpose`);
          const flow = t(`guide.features.${key}.flow`);
          // i18n returns the key string when a menu has no guide text yet.
          const rawSteps = t(`guide.features.${key}.steps`, {
            returnObjects: true,
          });
          const steps = Array.isArray(rawSteps) ? (rawSteps as string[]) : [];
          const note = t(`guide.features.${key}.note`);

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <AccordionItem
                value={key}
                className="glass-card rounded-xl border border-border px-4 overflow-hidden"
              >
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground font-normal">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-4 pl-12">
                    {purpose && (
                      <div className="flex gap-2">
                        <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {t("guide.purposeLabel")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {purpose}
                          </p>
                        </div>
                      </div>
                    )}

                    {flow && (
                      <div className="flex gap-2">
                        <Workflow className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {t("guide.flowLabel")}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {flow}
                          </p>
                        </div>
                      </div>
                    )}

                    {steps.length > 0 && (
                      <div className="flex gap-2">
                        <ListChecks className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-foreground mb-1">
                            {t("guide.stepsLabel")}
                          </p>
                          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
                            {steps.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}

                    {note && (
                      <div className="flex gap-2 bg-secondary/60 border border-border/60 rounded-lg px-3 py-2">
                        <StickyNote className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground">
                            {t("guide.noteLabel")}:
                          </span>{" "}
                          {note}
                        </p>
                      </div>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleOpen(item)}
                      className="w-fit gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {t("guide.open")}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </motion.div>
          );
        })}
      </Accordion>
    </div>
  );
}
