import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/auth";
import { useNavGroups } from "@/lib/navigation";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { cn } from "@/lib/utils";

/** Mobile drawer always shows it in full and passes no toggle. */
export function Sidebar({ collapsed = false, onToggleCollapsed }: { collapsed?: boolean; onToggleCollapsed?: () => void }) {
  const location = useLocation();
  const { canRead } = useAuth();
  const { t } = useTranslation();
  const navGroups = useNavGroups();
  const { data: counts } = useSidebarCounts();

  return (
    <aside
      className={cn(
        "relative flex-shrink-0 flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("h-16 flex items-center border-b border-sidebar-border", collapsed ? "justify-center" : "px-5")}>
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-auto flex-shrink-0 text-primary" />
          <div className={cn(collapsed && "sr-only")}>
            <p className="text-sm font-semibold text-foreground leading-none">
              {t("app.name")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
              {t("app.tagline")}
            </p>
          </div>
        </div>
      </div>

      <nav className={cn("flex-1 py-4 space-y-4 overflow-y-auto overflow-x-hidden scrollbar-thin", collapsed ? "px-2" : "px-3")}>
        {navGroups.map((group, groupIndex) => {
          const visibleItems = group.items.filter(
            (item) => !item.featureKey || canRead(item.featureKey) || !!item.alsoFeatureKeys?.some(canRead),
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              {collapsed ? (
                groupIndex > 0 && <div className="mx-2 mb-3 h-px bg-sidebar-border" role="separator" />
              ) : (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-2">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.href);

                  const count = item.badgeKey ? counts?.[item.badgeKey] : 0;
                  return (
                    <NavLink
                      key={item.href}
                      to={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? (count ? `${item.label} (${count})` : item.label) : undefined}
                    >
                      <motion.div
                        whileHover={{ x: 2 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "relative flex items-center gap-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group",
                          collapsed ? "justify-center px-0" : "px-3",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                        )}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="active-pill"
                            // Centred with inset + auto margin: layoutId animates transform, which would drop a translate.
                            className="absolute inset-y-0 left-0 my-auto w-0.5 h-5 bg-primary rounded-full"
                            transition={{
                              type: "spring",
                              stiffness: 400,
                              damping: 30,
                            }}
                          />
                        )}
                        <item.icon
                          className={cn(
                            "w-4 h-4 flex-shrink-0 transition-colors",
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground",
                          )}
                          strokeWidth={isActive ? 2.5 : 2}
                        />
                        {collapsed ? (
                          count ? (
                            <span className="absolute right-1.5 top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-semibold leading-4 text-primary-foreground tabular-nums">
                              {count}
                            </span>
                          ) : null
                        ) : (
                        <>
                        <span className={cn("flex-1 min-w-0 truncate text-sm font-medium", isActive && "text-primary")}>
                          {item.label}
                        </span>
                        {count ? (
                          <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[10px] font-semibold leading-5 text-primary-foreground tabular-nums">
                            {count}
                          </span>
                        ) : null}
                        </>
                        )}
                      </motion.div>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2.5 rounded-lg bg-sidebar-accent">
            <p className="text-[11px] font-medium text-foreground">
              {t("app.footer")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {t("app.version")}
            </p>
          </div>
        </div>
      )}

      {/* Sits on the sidebar's right edge, level with the header. */}
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
          title={collapsed ? t("nav.expand") : t("nav.collapse")}
          className="absolute -right-3 top-5 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}
    </aside>
  );
}
