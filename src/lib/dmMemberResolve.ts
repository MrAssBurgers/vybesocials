import { inferOtherParticipantId } from '@/lib/dmMembershipRepair';
import { safeDmMembers } from '@/lib/persistedCollections';

export function isViewerMember(
  memberUserId: string,
  viewerProfileId: string | undefined,
  viewerAuthUid?: string | null,
): boolean {
  if (!memberUserId || !viewerProfileId) return false;
  if (memberUserId === viewerProfileId) return true;
  if (viewerAuthUid && memberUserId === viewerAuthUid) return true;
  return false;
}

/** Best-effort other participant id (profile id or auth uid). */
export function inferOtherUserIdFromConversation(
  conversation: {
    id?: string;
    member_ids?: string[];
    members?: Array<{ user_id: string }>;
  },
  viewerProfileId: string,
  viewerAuthUid?: string | null,
): string | null {
  const fromMembers = safeDmMembers(conversation.members).find(
    (m) => !isViewerMember(String(m.user_id), viewerProfileId, viewerAuthUid),
  )?.user_id;
  if (fromMembers) return String(fromMembers);

  const fromIds = (conversation.member_ids || []).find(
    (id) => !isViewerMember(String(id), viewerProfileId, viewerAuthUid),
  );
  if (fromIds) return String(fromIds);

  if (conversation.id) {
    return inferOtherParticipantId(conversation.id, viewerProfileId);
  }
  return null;
}

export function buildConversationMembers(
  conversationId: string,
  existingMembers: Array<Record<string, unknown>>,
  memberIds: string[] | undefined,
  profileByKey: Map<string, Record<string, unknown>>,
  viewerProfileId: string,
  viewerAuthUid?: string | null,
): Array<Record<string, unknown>> {
  const byUserId = new Map<string, Record<string, unknown>>();

  for (const raw of existingMembers) {
    const user_id = String(raw.user_id || '');
    if (!user_id) continue;
    byUserId.set(user_id, {
      ...raw,
      user_id,
      profile: raw.profile || profileByKey.get(user_id) || null,
    });
  }

  const allIds = new Set<string>();
  for (const id of memberIds || []) allIds.add(String(id));
  for (const m of existingMembers) {
    if (m.user_id) allIds.add(String(m.user_id));
  }
  const inferred = inferOtherParticipantId(conversationId, viewerProfileId);
  if (inferred) allIds.add(inferred);
  if (viewerProfileId) allIds.add(viewerProfileId);
  if (viewerAuthUid) allIds.add(viewerAuthUid);

  for (const user_id of allIds) {
    const profile = profileByKey.get(user_id) || null;
    if (byUserId.has(user_id)) {
      const row = byUserId.get(user_id)!;
      if (!row.profile && profile) row.profile = profile;
      continue;
    }
    byUserId.set(user_id, {
      conversation_id: conversationId,
      user_id,
      role: 'member',
      profile,
    });
  }

  return [...byUserId.values()];
}

export function resolveOtherMemberFromConversation(
  conversation: {
    id?: string;
    member_ids?: string[];
    members?: Array<{ user_id: string; profile?: Record<string, unknown> | null }>;
  },
  viewerProfileId: string | undefined,
  viewerAuthUid?: string | null,
): { user_id: string; profile: Record<string, unknown> | null } | null {
  if (!viewerProfileId) return null;

  const otherUserId = inferOtherUserIdFromConversation(
    conversation,
    viewerProfileId,
    viewerAuthUid,
  );
  if (!otherUserId) return null;

  const members = safeDmMembers(conversation.members);
  const memberRow = members.find((m) => {
    const uid = String(m.user_id);
    return uid === otherUserId || !isViewerMember(uid, viewerProfileId, viewerAuthUid);
  });

  const profile =
    memberRow?.profile ||
    members.find((m) => m.user_id === otherUserId)?.profile ||
    null;

  const canonicalId = profile?.id ? String(profile.id) : otherUserId;
  return { user_id: canonicalId, profile };
}

export function displayNameForConversation(
  conversation: {
    is_group?: boolean;
    name?: string | null;
    id?: string;
    member_ids?: string[];
    members?: Array<{ user_id: string; profile?: Record<string, unknown> | null }>;
  },
  viewerProfileId: string | undefined,
  viewerAuthUid?: string | null,
  fallback = 'Unknown',
): string {
  if (conversation.is_group) return conversation.name || 'Group Chat';
  const resolved = resolveOtherMemberFromConversation(
    conversation,
    viewerProfileId,
    viewerAuthUid,
  );
  const profile = resolved?.profile;
  return (
    (profile?.display_name as string | undefined) ||
    (profile?.username as string | undefined) ||
    fallback
  );
}
