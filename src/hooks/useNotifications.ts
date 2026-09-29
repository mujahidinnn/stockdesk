import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import type { Notification } from "@/lib/types";

export const NOTIFICATIONS_QK = ["notifications"] as const;
const QK = NOTIFICATIONS_QK;

/** Chat notifications (DM / mention) follow the channel's read state, not their own. */
export const isChatNotification = (n: Notification) =>
  !!n.link?.startsWith("/chat");

// Short two-tone chime via Web Audio - no asset to ship. Browsers block
// audio until the user has interacted with the page; failures are ignored.
const SOUND_KEY = "notif-sound-muted";

export function isNotificationSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotificationSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, muted ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

let audioCtx: AudioContext | undefined;
function playNotificationSound() {
  if (isNotificationSoundMuted()) return;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    [880, 1320].forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch {
    /* audio unavailable */
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery<Notification[]>({
    queryKey: [...QK, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Notification[];
    },
  });

  // Inserts reach this client only via Realtime (no client INSERT policy, 20260922 migration).
  // Keyed on user id, not `user` (new ref per auth event), to avoid recreating the channel and racing a duplicate subscription.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "t_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          playNotificationSound();
          qc.invalidateQueries({ queryKey: [...QK, userId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

/** Derives unread count from useNotifications() data; call that once per screen, not a second subscription. */
export function getUnreadCount(notifications: Notification[]): number {
  return notifications.filter((n) => !n.is_read).length;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("t_notifications")
        .update({ is_read: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("t_notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false)
        // Chat ones clear only when the channel is actually read.
        .not("link", "like", "/chat%");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
