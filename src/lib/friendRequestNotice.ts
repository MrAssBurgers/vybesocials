import { db } from '@/lib/firebase';
import {
  confirmedIncomingRequest,
  type FriendshipStatePayload,
  type IncomingFriendNotice,
} from '@/lib/friendRequestNoticeModel';

export type { IncomingFriendNotice, FriendshipStatePayload };
export { confirmedIncomingRequest, keepFriendRequestNotice } from '@/lib/friendRequestNoticeModel';

const ensuredNotices = new Set<string>();

export async function ensureFriendRequestNotice(recipientId: string, actorId: string): Promise<void> {
  if (!recipientId || !actorId || recipientId === actorId) return;
  const key = `${actorId}:${recipientId}`;
  if (ensuredNotices.has(key)) return;
  ensuredNotices.add(key);
  const { error } = await db.from('notifications').insert({
    user_id: recipientId,
    actor_id: actorId,
    type: 'friend_request',
    read: false,
    created_at: new Date().toISOString(),
    deep_link: '/friends/add?tab=requests',
  });
  if (error) ensuredNotices.delete(key);
}

export async function loadIncomingFriendRequestsFromNotices(
  partyIds: string[],
  receiverId: string,
): Promise<IncomingFriendNotice[]> {
  const notices = new Map<string, { actor_id: string; created_at?: string }>();
  for (const id of partyIds) {
    const { data, error } = await db
      .from('notifications')
      .select('actor_id, created_at')
      .eq('user_id', id)
      .eq('type', 'friend_request')
      .limit(40);
    if (error || !data) continue;
    for (const row of data as Array<{ actor_id?: string; created_at?: string }>) {
      const actorId = row.actor_id?.trim();
      if (!actorId || notices.has(actorId)) continue;
      notices.set(actorId, { actor_id: actorId, created_at: row.created_at });
    }
  }

  const incoming: IncomingFriendNotice[] = [];
  for (const notice of notices.values()) {
    const { data, error } = await db.functions.invoke<FriendshipStatePayload>(
      'get-friendship-state',
      { target_profile_id: notice.actor_id },
    );
    if (error) continue;
    const sender = await readSenderProfile(notice.actor_id);
    const row = confirmedIncomingRequest(notice, data, receiverId, sender);
    if (row) incoming.push(row);
  }
  return incoming;
}

async function readSenderProfile(actorId: string): Promise<IncomingFriendNotice['sender']> {
  const select = 'id, user_id, username, avatar_url, display_name';
  const byId = await db.from('profiles').select(select).eq('id', actorId).limit(1);
  const row = ((byId.data || []) as Array<Record<string, unknown>>)[0]
    || await profileByUserId(select, actorId);
  if (!row || typeof row.username !== 'string') return undefined;
  return {
    id: String(row.id || actorId),
    username: row.username,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    display_name: typeof row.display_name === 'string' ? row.display_name : null,
  };
}

async function profileByUserId(select: string, actorId: string): Promise<Record<string, unknown> | undefined> {
  const byUser = await db.from('profiles').select(select).eq('user_id', actorId).limit(1);
  return ((byUser.data || []) as Array<Record<string, unknown>>)[0];
}
