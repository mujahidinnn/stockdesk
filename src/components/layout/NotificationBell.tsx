import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  useNotifications,
  getUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  isNotificationSoundMuted,
  setNotificationSoundMuted,
  isChatNotification,
} from "@/hooks/useNotifications";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dateFnsLocale = useDateFnsLocale();
  const { data: notifications = [] } = useNotifications();
  const unreadCount = getUnreadCount(notifications);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [muted, setMuted] = useState(isNotificationSoundMuted);

  function toggleSound() {
    setNotificationSoundMuted(!muted);
    setMuted(!muted);
  }

  function handleSelect(n: Notification) {
    // Chat notifications are cleared by opening the channel (useMarkChannelRead).
    if (!n.is_read && !isChatNotification(n)) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-tour="notification-bell"
          className="relative p-1.5 rounded-md text-foreground hover:bg-secondary transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 z-[9999] bg-card border-border shadow-xl p-0"
      >
        <DropdownMenuLabel className="font-normal px-3 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">
            {t("notifications.title")}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                toggleSound();
              }}
              title={t(
                muted ? "notifications.soundOn" : "notifications.soundOff",
              )}
              aria-label={t(
                muted ? "notifications.soundOn" : "notifications.soundOff",
              )}
              className="text-muted-foreground hover:text-foreground"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            {notifications.some((n) => !n.is_read && !isChatNotification(n)) && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  markAllRead.mutate();
                }}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80"
              >
                <CheckCheck className="w-3 h-3" />
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-80 overflow-y-auto scrollbar-thin">
          {notifications.length === 0 ? (
            <EmptyState
              size="sm"
              icon={Bell}
              title={t("notifications.empty")}
              description={t("notifications.emptyHint")}
            />
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleSelect(n)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/40 last:border-0 hover:bg-secondary/60 transition-colors flex gap-2",
                  !n.is_read && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5",
                    n.is_read ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {n.title}
                  </p>
                  {n.body && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {n.body}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), {
                      addSuffix: true,
                      locale: dateFnsLocale,
                    })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
