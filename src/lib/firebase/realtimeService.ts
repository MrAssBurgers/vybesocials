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
  callback: (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void;
}

export interface RealtimeChannel {
  topic: string;
  unsubscribe: () => void;
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

export function subscribePostgresChannel(
  channelName: string,
  bindings: PostgresBinding[],
  onStatus?: (status: string) => void,
): RealtimeChannel {
  removeChannelByTopic(channelName);
  const topic = channelName.startsWith('realtime:') ? channelName : `realtime:${channelName}`;

  const unsubs: Unsubscribe[] = [];

  for (const binding of bindings) {
    const coll = collectionRef(binding.table);
    const parsed = parseFilter(binding.filter);
    const q = parsed
      ? query(coll, where(parsed.field, '==', parsed.value))
      : query(coll);

    const unsub = onSnapshot(q, (snapshot) => {
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
    });
    unsubs.push(unsub);
  }

  onStatus?.('SUBSCRIBED');

  const channel: RealtimeChannel = {
    topic,
    unsubscribe: () => {
      unsubs.forEach((u) => u());
      activeChannels.delete(topic);
      onStatus?.('CLOSED');
    },
  };

  activeChannels.set(topic, channel);
  return channel;
}

export function createRealtimeChannel(channelName: string) {
  const bindings: PostgresBinding[] = [];
  let statusCb: ((status: string) => void) | undefined;

  const builder = {
    on(
      _type: 'postgres_changes',
      config: { event: PostgresBinding['event']; schema?: string; table: string; filter?: string },
      callback: PostgresBinding['callback'],
    ) {
      bindings.push({
        event: config.event,
        schema: config.schema,
        table: config.table,
        filter: config.filter,
        callback,
      });
      return builder;
    },
    subscribe(cb?: (status: string) => void) {
      statusCb = cb;
      return subscribePostgresChannel(channelName, bindings, statusCb);
    },
  };

  return builder;
}

export function getActiveChannels(): RealtimeChannel[] {
  return Array.from(activeChannels.values());
}

export { getFirestoreDb, resolveCollection };
