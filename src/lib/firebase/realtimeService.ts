import {
  collectionRef,
  onSnapshot,
  query,
  where,
  resolveCollection,
  getFirestoreDb,
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
  // Optional chainable methods so RealtimeChannel is duck-type compatible with ChannelBuilder
  on?: (type: string, config: any, callback?: any) => any;
  subscribe?: (cb?: (status: string) => void) => any;
  send?: (payload: any) => Promise<'ok'>;
  track?: (state: any) => Promise<'ok'>;
  untrack?: () => Promise<'ok'>;
  presenceState?: () => Record<string, any[]>;
}

const activeChannels = new Map<string, RealtimeChannel>();

function parseFilter(filter?: string): { field: string; value: string } | null {
  if (!filter) return null;
  const m = filter.match(/(\w+)=eq\.(.+)/);
  if (!m) return null;
  return { field: m[1]!, value: m[2]! };
}

export function removeChannelByTopic(channelName: string): void {
  const topic = channelName.startsWith('realtime:') ? channelName : `realtime:${channelName}`;
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

function makeBuilderStub(base: RealtimeChannel): ChannelBuilder {
  const stub: ChannelBuilder = {
    ...base,
    on: () => stub,
    subscribe: () => stub,
    send: async () => 'ok' as const,
    track: async () => 'ok' as const,
    untrack: async () => 'ok' as const,
    presenceState: () => ({}),
  };
  return stub;
}

export function subscribePostgresChannel(
  channelName: string,
  bindings: PostgresBinding[],
  onStatus?: (status: string) => void,
): ChannelBuilder {
  removeChannelByTopic(channelName);
  const topic = channelName.startsWith('realtime:') ? channelName : `realtime:${channelName}`;

  const unsubs: Unsubscribe[] = [];

  for (const binding of bindings) {
    const coll = collectionRef(binding.table);
    const parsed = parseFilter(binding.filter);
    const q = parsed
      ? query(coll, where(parsed.field, '==', parsed.value))
      : query(coll);

    // Firestore emits every existing doc as `added` on first snapshot — skip that pass
    // so INSERT handlers don't replay historical rows as new events (toast spam).
    let isInitialSnapshot = true;

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (isInitialSnapshot) {
          isInitialSnapshot = false;
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

  const channel = makeBuilderStub(base);
  activeChannels.set(topic, channel);
  return channel;
}

export function createRealtimeChannel(channelName: string): ChannelBuilder {
  const bindings: PostgresBinding[] = [];
  let statusCb: ((status: string) => void) | undefined;
  let resolved: RealtimeChannel | null = null;

  const builder: ChannelBuilder = {
    topic: channelName.startsWith('realtime:') ? channelName : `realtime:${channelName}`,
    unsubscribe: () => { resolved?.unsubscribe(); },
    on(type: string, config: any, callback?: any) {
      if (type === 'postgres_changes' && callback) {
        bindings.push({
          event: config.event,
          schema: config.schema,
          table: config.table,
          filter: config.filter,
          callback,
        });
      }
      // broadcast/presence: no-op in firebase shim
      return builder;
    },
    subscribe(cb?: (status: string) => void) {
      statusCb = cb;
      resolved = subscribePostgresChannel(channelName, bindings, statusCb);
      builder.topic = resolved.topic;
      builder.unsubscribe = resolved.unsubscribe;
      return builder;
    },
    async send(_payload: any) { return 'ok' as const; },
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
