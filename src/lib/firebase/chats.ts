import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  where,
  orderBy,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import { getUserProfile } from './users';
import { resolveProfileIdFromAuthUid, syncUserAuthIndex } from './profileResolve';
import {
  normalizeToProfileId,
  findExistingDmBetweenProfiles,
  ensureDmMembershipPair,
} from '@/lib/dmMembershipRepair';
import { markConversationReadForViewer, getSessionAuthUid } from '@/lib/markConversationRead';
import type { ChatDocument } from './types';

export interface ChatWithMembers extends ChatDocument {
  members?: Array<{
    user_id: string;
    role: string;
    is_muted: boolean;
    is_pinned: boolean;
    last_read_at: string | null;
    profile?: {
      id: string;
      username: string;
      avatar_url?: string | null;
      display_name?: string | null;
    };
  }>;
}

export async function getChat(chatId: string): Promise<ChatWithMembers | null> {
  const chat = await getDocument<ChatDocument>('conversations', chatId);
  if (!chat) return null;
  return enrichChat(chat);
}

async function enrichChat(chat: ChatDocument): Promise<ChatWithMembers> {
  const memberRows = await getDocuments('conversation_members', [
    where('conversation_id', '==', chat.id),
  ]);

  const members = await Promise.all(
    memberRows.map(async (m) => {
      const profile = await getUserProfile(m.user_id as string);
      return {
        user_id: m.user_id as string,
        role: (m.role as string) || 'member',
        is_muted: Boolean(m.is_muted),
        is_pinned: Boolean(m.is_pinned),
        last_read_at: (m.last_read_at as string) || null,
        profile: profile ? {
          id: profile.id,
          username: profile.username,
          avatar_url: profile.avatar_url,
          display_name: profile.display_name,
        } : undefined,
      };
    }),
  );

  return { ...chat, members };
}

export async function listUserChats(userId: string): Promise<ChatWithMembers[]> {
  const memberships = await getDocuments('conversation_members', [
    where('user_id', '==', userId),
  ]);

  const chats = await Promise.all(
    memberships.map(async (m) => {
      const chat = await getDocument<ChatDocument>('conversations', m.conversation_id as string);
      return chat ? enrichChat(chat) : null;
    }),
  );

  return chats
    .filter((c): c is ChatWithMembers => c !== null)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function createDmChat(otherUserId: string, accountGuard?: () => void): Promise<string> {
  accountGuard?.();
  const { data: { user } } = await firebaseAuth.getUser();
  accountGuard?.();
  if (!user) throw new Error('Not authenticated');

  const myProfileId = (await resolveProfileIdFromAuthUid(user.id)) || user.id;
  accountGuard?.();
  const otherId = (await normalizeToProfileId(otherUserId)) || otherUserId;
  accountGuard?.();
  await syncUserAuthIndex(user.id, myProfileId);
  accountGuard?.();

  const existing = await findExistingDmBetweenProfiles(myProfileId, otherId);
  accountGuard?.();
  if (existing) {
    await ensureDmMembershipPair(existing, myProfileId, otherId);
    accountGuard?.();
    return existing;
  }

  const profileMemberIds = [myProfileId, otherId].sort();
  const chatId = profileMemberIds.join('_');
  const otherProfile = await getUserProfile(otherId);
  accountGuard?.();
  const otherAuthUid = otherProfile?.user_id ?? null;
  const allMemberIds = [
    ...new Set([myProfileId, otherId, user.id, otherAuthUid].filter(Boolean)),
  ] as string[];
  const now = new Date().toISOString();

  await setDocument('conversations', chatId, {
    id: chatId,
    is_group: false,
    member_ids: allMemberIds,
    name: null,
    avatar_url: null,
    created_by: myProfileId,
    created_at: now,
    updated_at: now,
  });
  accountGuard?.();

  for (const memberId of allMemberIds) {
    accountGuard?.();
    await setDocument('conversation_members', `${chatId}_${memberId}`, {
      id: `${chatId}_${memberId}`,
      conversation_id: chatId,
      user_id: memberId,
      role: memberId === myProfileId ? 'admin' : 'member',
      is_muted: false,
      is_pinned: false,
      last_read_at: null,
      created_at: now,
      updated_at: now,
    });
    accountGuard?.();
  }

  return chatId;
}

export async function updateChat(chatId: string, updates: Partial<ChatDocument>): Promise<void> {
  await updateDocument('conversations', chatId, updates);
}

export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const authUid = await getSessionAuthUid();
  await markConversationReadForViewer(chatId, userId, authUid);
}
