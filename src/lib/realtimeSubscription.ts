import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Entry {
  channel: RealtimeChannel;
  refCount: number;
}

const registry = new Map<string, Entry>();

/**
 * Ref-counted wrapper around a Supabase Realtime channel. Supabase rejects a
 * second `.on()` call on a channel that's already `.subscribe()`d, so a
 * hook that opens its own channel breaks the moment it's mounted twice at
 * once (e.g. the same list hook called by several sibling components).
 * `setup` runs only for the channel's first subscriber; later callers just
 * bump the ref count and share the existing subscription. Returns the
 * cleanup to run on unmount - the channel is torn down once nobody's left.
 */
export function subscribeShared(
  topic: string,
  setup: (channel: RealtimeChannel) => void,
): () => void {
  let entry = registry.get(topic);
  if (!entry) {
    const channel = supabase.channel(topic);
    setup(channel);
    channel.subscribe();
    entry = { channel, refCount: 0 };
    registry.set(topic, entry);
  }
  entry.refCount += 1;

  return () => {
    const e = registry.get(topic);
    if (!e) return;
    e.refCount -= 1;
    if (e.refCount <= 0) {
      supabase.removeChannel(e.channel);
      registry.delete(topic);
    }
  };
}
