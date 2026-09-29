import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ShieldCheck,
  UserCog,
  Monitor,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";
import { WarehouseSwitcher } from "./WarehouseSwitcher";
import { CommandPalette } from "./CommandPalette";
import { SignOutConfirmModal } from "./SignOutConfirmModal";
import { useTheme } from "@/context/theme";
import { useAuth } from "@/context/auth";
import { useNavGroups } from "@/lib/navigation";
import { useFirstVisitTour } from "@/lib/appTour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "stockdesk.sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked: the choice just won't persist */
      }
      return !c;
    });
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  const { profile, signOut, isAdmin } = useAuth();
  const { t } = useTranslation();

  const navItem = useNavGroups()
    .flatMap((g) => g.items)
    .find((i) => i.href === location.pathname);
  useFirstVisitTour(navItem?.featureKey, profile?.id);
  const isProfile = location.pathname === "/settings/profile";
  const pageTitle =
    navItem?.label ?? (isProfile ? t("profile.title") : "StockDesk");
  const pageSubtitle =
    navItem?.description ?? (isProfile ? t("profile.subtitle") : "");

  const initials = (profile?.full_name ?? "A")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const avatarUrl = profile?.avatar_url ?? null;

  return (
    <div className="flex h-full bg-app-gradient overflow-hidden">
      <CommandPalette onRequestSignOut={() => setSignOutConfirmOpen(true)} />
      <SignOutConfirmModal
        open={signOutConfirmOpen}
        onOpenChange={setSignOutConfirmOpen}
        onConfirm={signOut}
      />

      {/* No overflow-hidden: the collapse toggle hangs over the sidebar's edge. */}
      <div className="relative z-40 hidden md:block flex-shrink-0">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-zinc-950/40 dark:bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: "spring", stiffness: 400, damping: 40 }}
              className="fixed left-0 top-0 h-full z-50 md:hidden"
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header sits outside the scroll container so the scrollbar starts below it. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header
          className={cn(
            "relative z-30 h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-6 border-b transition-[background-color,border-color,box-shadow] duration-300 ease-out",
            scrolled
              ? "bg-background border-border shadow-sm"
              : "border-transparent",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              aria-label={t("nav.openMenu")}
              className="md:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base md:text-lg font-semibold tracking-tight text-foreground leading-tight">
                {pageTitle}
              </h1>
              <p className="text-xs text-foreground mt-0.5 leading-none hidden sm:block">
                {pageSubtitle}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <WarehouseSwitcher />
            <NotificationBell />

            {/* Rendered via Radix portal to avoid overflow/z-index clipping. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-tour="user-menu"
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-secondary transition-colors outline-none"
                >
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        loading="lazy"
                        decoding="async"
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-brand flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white">
                          {initials}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-medium text-foreground hidden sm:block max-w-[100px] truncate">
                    {profile?.full_name ?? "User"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-foreground" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-52 z-[9999] bg-card border-border shadow-elevated"
              >
                <DropdownMenuLabel className="font-normal px-3 py-2.5">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {profile?.full_name ?? "User"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {profile?.role?.role_name ?? "-"}
                  </p>
                </DropdownMenuLabel>

                {isAdmin() && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-rose-700 bg-rose-100 border border-rose-300 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/40 px-2 py-0.5 rounded-full">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        {t("shell.administrator")}
                      </span>
                    </div>
                  </>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/settings/profile")}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-foreground hover:bg-secondary focus:bg-secondary cursor-pointer"
                >
                  <UserCog className="w-3.5 h-3.5 text-muted-foreground" />
                  {t("shell.profileSettings")}
                </DropdownMenuItem>

                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-foreground">
                    {t("shell.theme")}
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={t("shell.theme")}
                    className="flex items-center gap-0.5 p-0.5 rounded-md bg-secondary"
                  >
                    {(
                      [
                        ["light", Sun, "shell.themeLight"],
                        ["dark", Moon, "shell.themeDark"],
                        ["system", Monitor, "shell.themeSystem"],
                      ] as const
                    ).map(([value, Icon, labelKey]) => (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={preference === value}
                        aria-label={t(labelKey)}
                        title={t(labelKey)}
                        onClick={() => setPreference(value)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          preference === value
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSignOutConfirmOpen(true)}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-100 focus:text-rose-700 focus:bg-rose-100 dark:text-rose-400 dark:hover:text-rose-300 dark:focus:text-rose-300 dark:hover:bg-rose-950/30 dark:focus:bg-rose-950/30 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {t("shell.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div
          onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin"
        >
          <main className="p-4 md:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="min-h-full"
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
