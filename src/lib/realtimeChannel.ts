import type {
  RealtimeChannel,
  RealtimePostgresChangesFilter,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
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

type PostgresBinding<T extends Record<string, unknown>> = {
  event: RealtimePostgresChangesFilter<T>['event'];
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<T>) => void;
};

export function subscribePostgresChannel<T extends Record<string, unknown> = Record<string, unknown>>(
  channelName: string,
  bindings: PostgresBinding<T>[],
  onStatus?: (status: string) => void,
): RealtimeChannel {
  removeChannelByTopic(channelName);

  let channel = supabase.channel(channelName);
  for (const binding of bindings) {
    channel = channel.on(
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
