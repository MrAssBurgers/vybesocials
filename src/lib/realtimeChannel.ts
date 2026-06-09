import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

function channelTopic(name: string): string {
  return name.startsWith('realtime:') ? name : `realtime:${name}`;
}

/** Drop any existing client channel with this topic so `.on()` never runs after `subscribe()`. */
export function removeChannelByTopic(channelName: string): void {
  const topic = channelTopic(channelName);
  const existing = supabase.getChannels().find((ch) => ch.topic === topic);
  if (existing) {
    try {
      supabase.removeChannel(existing);
    } catch {
      // ignore — channel may already be tearing down
    }
  }
}

export function removeRealtimeChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  try {
    supabase.removeChannel(channel);
  } catch {
    // ignore
  }
}

type PostgresEvent = '*' | 'INSERT' | 'UPDATE' | 'DELETE';

type PostgresBinding = {
  event: PostgresEvent;
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload: any) => void;
};

export function subscribePostgresChannel(
  channelName: string,
  bindings: PostgresBinding[],
  onStatus?: (status: string) => void,
): RealtimeChannel {
  removeChannelByTopic(channelName);

  let channel = supabase.channel(channelName);
  for (const binding of bindings) {
    channel = (channel as any).on(
      'postgres_changes',
      {
        event: binding.event,
        schema: binding.schema ?? 'public',
        table: binding.table,
        filter: binding.filter,
      },
      binding.callback,
    );
  }

  channel.subscribe((status) => {
    onStatus?.(status);
  });

  return channel;
}
