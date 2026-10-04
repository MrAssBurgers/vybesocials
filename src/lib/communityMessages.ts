import { db } from '@/lib/firebase';
import { collectionRef, getDocumentsFromServer, onSnapshot, orderBy, query, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import type { ChannelMessage } from '@/hooks/useServers';
import type { CommunityAccountLease } from './communityService';

export async function loadCommunityMessages(channelId: string, guard: CommunityAccountLease): Promise<ChannelMessage[]> {
  guard();
  const messages = await getDocumentsFromServer<ChannelMessage>('channel_messages', [
    where('channel_id', '==', channelId), where('is_deleted', '==', false),
    orderBy('created_at', 'asc'), firestoreLimit(100),
  ]);
  guard();
  const senders = [...new Set(messages.map(message => message.sender_id).filter(Boolean))];
  const profiles = new Map<string, NonNullable<ChannelMessage['sender']>>();
  for (let offset = 0; offset < senders.length; offset += 30) {
    const { data, error } = await db.from('profiles').select('id,username,display_name,avatar_url').in('id', senders.slice(offset, offset + 30));
    guard();
    if (error) throw error;
    for (const profile of data || []) profiles.set(profile.id, profile);
  }
  return messages.filter(message => message.channel_id === channelId && !message.is_deleted)
    .map(message => ({ ...message, sender: profiles.get(message.sender_id) }));
}

/** The generic legacy subscriber swallows permission errors. Private history must not. */
export function watchCommunityChannel(channelId: string, changed: () => void, failed: (error: Error) => void) {
  return onSnapshot(query(collectionRef('channel_messages'), where('channel_id', '==', channelId),
    where('is_deleted', '==', false), orderBy('created_at', 'asc'), firestoreLimit(100)),
  snapshot => { if (!snapshot.metadata.fromCache) changed(); }, failed);
}
