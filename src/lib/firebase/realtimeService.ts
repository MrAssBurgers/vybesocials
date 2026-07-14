import {
  collectionRef,
  onSnapshot,
  query,
  where,
  resolveCollection,
  getFirestoreDb,
  setDocument,
  documentRef,
  newDocumentId,
} from './firestoreDb';
import type { Unsubscribe } from 'firebase/firestore';

export interface PostgresBinding {
  event: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload: { eventType: string; new: any; old: any }) => void;
}

export interface RealtimeChannel {
  topic: string;
  unsubscribe: () => void;
  on?: (type: string, config: any, callback?: any) => any;
  subscribe?: (cb?: (status: string) => void) => any;
  send?: (payload: any) => Promise<'ok'>;
  track?: (state: any) => Promise<'ok'>;
  untrack?: () => Promise<'ok'>;
  presenceState?: () => Record<string, any[]>;
}

const activeChannels = new Map<string, RealtimeChannel>();

type BroadcastHandler = (payload: { payload: unknown }) => void;

function parseFilter(filter?: string): { field: string; value: string } | null {
  if (!filter) return null;
  const m = filter.match(/(\w+)=eq\.(.+)/);
  if (!m) return null;
  return { field: m[1]!, value: m[2]! };
}

function normalizeTopic(channelName: string): string {
  return channelName.startsWith('realtime:') ? channelName : `realtime:${channelName}`;
}

export function removeChannelByTopic(channelName: string): void {
  const topic = normalizeTopic(channelName);
  const existing = activeChannels.get(topic);
  if (existing) {
    existing.unsubscribe();
    activeChannels.delete(topic);
  }
}

export function removeRealtimeChannel(channel: RealtimeChannel | null | undefined): void {
  if (!channel) return;
  channel.unsubscribe();
  activeChannels.delete(channel.topic);
}

export interface ChannelBuilder extends RealtimeChannel {
  on: (type: string, config: any, callback?: any) => ChannelBuilder;
  subscribe: (cb?: (status: string) => void) => ChannelBuilder;
  send: (payload: any) => Promise<'ok'>;
  track: (state: any) => Promise<'ok'>;
  untrack: () => Promise<'ok'>;
  presenceState: () => Record<string, any[]>;
}

export function subscribePostgresChannel(
  channelName: string,
  bindings: PostgresBinding[],
  onStatus?: (status: string) => void,
): ChannelBuilder {
  removeChannelByTopic(channelName);
  const topic = normalizeTopic(channelName);

  const unsubs: Unsubscribe[] = [];

  for (const binding of bindings) {
    const coll = collectionRef(binding.table);
    const parsed = parseFilter(binding.filter);
    const q = parsed
      ? query(coll, where(parsed.field, '==', parsed.value))
      : query(coll);

    // Firestore persistence often emits an empty fromCache snapshot first, then a
    // server snapshot where every matching doc is `added`. Skipping only callback #1
    // lets historical DMs look like INSERT and spam foreground toasts. Discard the
    // entire bootstrap batch (non-empty cache seed OR first server sync) before live events.
    let bootstrapComplete = false;

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (!bootstrapComplete) {
          // Keep waiting while the local cache is still empty — the real seed arrives next.
          if (snapshot.metadata.fromCache && snapshot.empty) {
            return;
          }
          bootstrapComplete = true;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          const eventType =
            change.type === 'added' ? 'INSERT' :
            change.type === 'modified' ? 'UPDATE' : 'DELETE';

          if (binding.event !== '*' && binding.event !== eventType) return;

          binding.callback({
            eventType,
            new: { id: change.doc.id, ...change.doc.data() },
            old: change.type === 'removed' ? { id: change.doc.id, ...change.doc.data() } : {},
          });
        });
      },
      (error) => {
        if (error.code === 'permission-denied') return;
        console.warn(`[Realtime] ${binding.table} listener:`, error.message);
      },
    );
    unsubs.push(unsub);
  }

  onStatus?.('SUBSCRIBED');

  const base: RealtimeChannel = {
    topic,
    unsubscribe: () => {
      unsubs.forEach((u) => u());
      activeChannels.delete(topic);
      onStatus?.('CLOSED');
    },
  };

  const channel: ChannelBuilder = {
    ...base,
    on: () => channel,
    subscribe: () => channel,
    send: async () => 'ok' as const,
    track: async () => 'ok' as const,
    untrack: async () => 'ok' as const,
    presenceState: () => ({}),
  };

  activeChannels.set(topic, channel);
  return channel;
}

function subscribeBroadcastChannel(
  channelName: string,
  handlers: Map<string, BroadcastHandler[]>,
  onStatus?: (status: string) => void,
): Unsubscribe {
  const coll = collectionRef('webrtc_signals');
  const q = query(coll, where('channel', '==', channelName));
  let isInitial = true;

  return onSnapshot(
    q,
    (snapshot) => {
      if (isInitial) {
        // Mirror subscribePostgresChannel: empty fromCache is not the bootstrap batch yet.
        if (snapshot.metadata.fromCache && snapshot.empty) {
          return;
        }
        isInitial = false;
        onStatus?.('SUBSCRIBED');
        return;
      }

      snapshot.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const data = change.doc.data() as { event?: string; payload?: unknown };
        const event = data.event || 'signal';
        const list = handlers.get(event) || [];
        for (const handler of list) {
          try {
            handler({ payload: data.payload });
          } catch (err) {
            console.warn('[Realtime] broadcast handler error:', err);
          }
        }
      });
    },
    (error) => {
      if (error.code === 'permission-denied') {
        console.warn('[Realtime] webrtc_signals permission denied');
        onStatus?.('CHANNEL_ERROR');
        return;
      }
      console.warn('[Realtime] broadcast listener:', error.message);
      onStatus?.('CHANNEL_ERROR');
    },
  );
}

export function createRealtimeChannel(channelName: string): ChannelBuilder {
  const bindings: PostgresBinding[] = [];
  const broadcastHandlers = new Map<string, BroadcastHandler[]>();
  let postgresChannel: RealtimeChannel | null = null;
  let broadcastUnsub: Unsubscribe | null = null;
  const topic = normalizeTopic(channelName);

  const builder: ChannelBuilder = {
    topic,
    unsubscribe: () => {
      broadcastUnsub?.();
      broadcastUnsub = null;
      postgresChannel?.unsubscribe();
      activeChannels.delete(topic);
    },
    on(type: string, config: any, callback?: any) {
      if (type === 'postgres_changes' && callback) {
        bindings.push({
          event: config.event,
          schema: config.schema,
          table: config.table,
          filter: config.filter,
          callback,
        });
      } else if (type === 'broadcast' && callback) {
        const event = config?.event || 'signal';
        const list = broadcastHandlers.get(event) || [];
        list.push(callback);
        broadcastHandlers.set(event, list);
      }
      return builder;
    },
    subscribe(cb?: (status: string) => void) {
      if (bindings.length) {
        postgresChannel = subscribePostgresChannel(channelName, bindings, cb);
        builder.topic = postgresChannel.topic;
        builder.unsubscribe = () => {
          broadcastUnsub?.();
          postgresChannel?.unsubscribe();
          activeChannels.delete(topic);
        };
      } else if (broadcastHandlers.size > 0) {
        broadcastUnsub = subscribeBroadcastChannel(channelName, broadcastHandlers, cb);
      } else {
        cb?.('SUBSCRIBED');
      }
      activeChannels.set(topic, builder);
      return builder;
    },
    async send(payload: any) {
      if (payload?.type === 'broadcast') {
        const id = newDocumentId('webrtc_signals');
        await setDocument('webrtc_signals', id, {
          id,
          channel: channelName,
          event: payload.event || 'signal',
          payload: payload.payload ?? null,
          created_at: new Date().toISOString(),
        });
      }
      return 'ok' as const;
    },
    async track(_state: any) { return 'ok' as const; },
    async untrack() { return 'ok' as const; },
    presenceState() { return {}; },
  };

  return builder;
}

export function getActiveChannels(): RealtimeChannel[] {
  return Array.from(activeChannels.values());
}

export { getFirestoreDb, resolveCollection };
