import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/brand/Logo";

// Warehouse-to-warehouse transfer routes: dashed curves between hub nodes.
const hubs = [
  [120, 160], [520, 90], [860, 300], [1320, 140], [1500, 520],
  [1080, 700], [620, 620], [260, 780], [180, 460],
];
const lanes = [
  "M120 160 C300 40 420 60 520 90", "M520 90 C700 140 760 220 860 300",
  "M860 300 C1040 180 1200 100 1320 140", "M1320 140 C1480 260 1540 380 1500 520",
  "M1500 520 C1380 680 1220 720 1080 700", "M1080 700 C900 620 760 600 620 620",
  "M620 620 C480 700 360 800 260 780", "M260 780 C120 700 100 560 180 460",
  "M180 460 C260 320 80 260 120 160", "M180 460 C420 420 640 380 860 300",
  "M860 300 C900 460 1000 600 1080 700", "M620 620 C660 480 760 380 860 300",
];
const routes = (stroke: string, opacity: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900' preserveAspectRatio='xMidYMid slice'>` +
      `<g fill='none' stroke='${stroke}' stroke-opacity='${opacity}' stroke-width='1.5' stroke-dasharray='6 8' stroke-linecap='round'>` +
      lanes.map((d) => `<path d='${d}'/>`).join("") +
      `</g><g fill='${stroke}' fill-opacity='${opacity * 0.8}'>` +
      hubs.map(([x, y]) => `<circle cx='${x}' cy='${y}' r='5'/><circle cx='${x}' cy='${y}' r='14' fill-opacity='${opacity * 0.35}'/>`).join("") +
      `</g></svg>`,
  )}")`;

// Same route map behind the card, tinted by soft brand glows in each corner.
const pageBg = {
  backgroundImage:
    `${routes("hsl(224 70% 45%)", 0.14)},` +
    "radial-gradient(circle at 0% 0%, hsl(224 90% 60% / .28), transparent 40%)," +
    "radial-gradient(circle at 100% 100%, hsl(236 85% 62% / .3), transparent 45%)," +
    "radial-gradient(circle at 100% 0%, hsl(199 90% 60% / .18), transparent 35%)",
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundAttachment: "fixed",
} as const;

const heroBg = {
  backgroundImage:
    "radial-gradient(ellipse at 90% 100%, hsl(230 80% 65% / .9), transparent 60%)," +
    "linear-gradient(160deg, hsl(236 75% 42%), hsl(222 80% 52%))",
  backgroundSize: "cover",
  backgroundPosition: "center",
} as const;

// Card stays light in both themes; scoped CSS vars make the shadcn inputs and buttons follow.
const lightCard = {
  "--card": "0 0% 100%",
  "--foreground": "222 47% 11%",
  "--muted-foreground": "220 9% 46%",
  "--background": "0 0% 100%",
  "--border": "220 13% 88%",
  "--input": "220 13% 88%",
  "--accent": "221 60% 96%",
  "--accent-foreground": "222 47% 11%",
  "--secondary": "220 14% 96%",
  "--secondary-foreground": "222 47% 11%",
  colorScheme: "light",
} as CSSProperties;

function Brand({ className, taglineClass }: { className: string; taglineClass: string }) {
  const { t } = useTranslation();
  return (
    <div className={`items-center gap-2 ${className}`}>
      <LogoMark className="h-8 w-auto" />
      <div className="leading-tight">
        <p className="font-bold tracking-tight">{t("app.name")}</p>
        <p className={`text-xs ${taglineClass}`}>{t("login.brandTagline")}</p>
      </div>
    </div>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex md:items-center md:justify-center md:p-8 bg-slate-100 dark:bg-slate-950"
      style={pageBg}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={lightCard}
        className="w-full min-h-screen md:min-h-0 max-w-6xl grid grid-rows-[auto_1fr] md:grid-rows-none md:grid-cols-[5fr_6fr] md:gap-2 md:p-2 md:rounded-3xl bg-card text-foreground md:shadow-2xl"
      >
        <section className="relative z-10 -mt-6 md:mt-0 rounded-t-3xl md:rounded-none bg-card flex flex-col px-6 pt-7 pb-8 sm:px-12 md:py-10 md:min-h-[600px]">
          <Brand className="hidden md:flex" taglineClass="text-muted-foreground" />
          <div className="flex-1 flex items-start md:items-center md:py-10">
            <div className="w-full max-w-sm mx-auto">{children}</div>
          </div>
        </section>

        <aside
          className="order-first md:order-none flex relative overflow-hidden flex-col md:rounded-2xl h-60 p-6 pb-12 md:h-auto md:p-10 text-white"
          style={heroBg}
        >
          <Brand className="relative z-10 flex md:hidden" taglineClass="text-white/80" />
          <div className="relative z-10 mt-auto md:mt-0 space-y-3 max-w-[55%] md:max-w-sm">
            <h2 className="text-xl md:text-3xl font-semibold leading-tight whitespace-pre-line">
              {t("login.heroTitle")}
            </h2>
            <p className="hidden md:block text-sm text-white/80">{t("login.heroBody")}</p>
          </div>
          {/* Tilted device frame around a real dashboard capture. */}
          <div className="absolute -right-36 -bottom-28 w-[300px] rounded-2xl p-2 md:-right-40 md:-bottom-40 md:w-[600px] md:rounded-[2rem] md:p-3 rotate-[16deg] bg-slate-900 shadow-[0_40px_80px_-20px_rgb(0_0_0/.6)]">
            <img
              src="/auth-preview.webp"
              alt=""
              className="block w-full rounded-xl md:rounded-[1.4rem]"
            />
          </div>
        </aside>
      </motion.div>
    </div>
  );
}
