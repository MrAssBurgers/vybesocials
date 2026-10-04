import { getCachedCurrentProfile, getCachedProfile } from '@/lib/profileCache';
import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';

type OwnedProfile = { id?: string; user_id?: string } | null | undefined;

/** A disk profile without its authenticated owner is not a private-data alias. */
export function ownedDmProfileId(uid: string | null | undefined, profile?: OwnedProfile): string | undefined {
  if (!uid) return undefined;
  if (profile?.id && profile.user_id === uid) return profile.id;
  const cached = getCachedCurrentProfile();
  return cached?.user_id === uid ? cached.id : undefined;
}

export function isOwnedDmActor(actorId: string | null | undefined, uid: string): boolean {
  if (actorId === uid) return true;
  if (!actorId) return false;
  const profile = getCachedProfile(actorId);
  return profile?.user_id === uid || ownedDmProfileId(uid) === actorId;
}

export function dmListQueryKey(profileId: string | null | undefined, session: ReportAccountSession = reportAccountSnapshot()) {
  return ['dm-conversations', profileId, session.uid, session.epoch] as const;
}

export function conversationDetailQueryKey(conversationId: string | undefined, session: ReportAccountSession = reportAccountSnapshot()) {
  return ['conversation-detail', conversationId, session.uid, session.epoch] as const;
}

/** Cached members are display data; a stored parent member_ids list takes precedence. */
export function isDmConversationForViewer(value: unknown, profileId?: string | null, uid?: string | null): boolean {
  if (!value || typeof value !== 'object' || !uid) return false;
  const row = value as { id?: unknown; member_ids?: unknown; members?: unknown };
  const aliases = new Set([uid, profileId].filter(Boolean));
  if (Array.isArray(row.member_ids)) return row.member_ids.some(id => typeof id === 'string' && aliases.has(id));
  if (!Array.isArray(row.members)) return false;
  return row.members.some(member => member && typeof member === 'object'
    && member.conversation_id === row.id && aliases.has(member.user_id));
}
