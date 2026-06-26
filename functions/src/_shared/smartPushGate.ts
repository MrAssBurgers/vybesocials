import { db } from './admin.js';

const PRESENCE_STALE_MS = 30_000;

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

export type SmartPushSkipReason =
  | 'viewing_conversation'
  | 'conversation_muted'
  | 'member_muted'
  | 'blocked'
  | 'preference_disabled'
  | 'quiet_hours';

export interface SmartPushGateInput {
  recipientProfileId: string;
  senderProfileId: string;
  conversationId?: string;
  type: string;
  /** When true, skip if recipient is actively viewing this conversation. */
  checkActiveConversation?: boolean;
}

async function resolveAuthUidForProfile(profileId: string): Promise<string | null> {
  const prof = await db.collection('profiles').doc(profileId).get();
  if (!prof.exists) return null;
  return asString(prof.data()?.user_id) || null;
}

async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    db.collection('blocked_users').where('blocker_id', '==', a).where('blocked_id', '==', b).limit(1).get(),
    db.collection('blocked_users').where('blocker_id', '==', b).where('blocked_id', '==', a).limit(1).get(),
  ]);
  return !ab.empty || !ba.empty;
}

async function isConversationMuted(
  recipientProfileId: string,
  conversationId: string,
): Promise<boolean> {
  const authUid = await resolveAuthUidForProfile(recipientProfileId);
  const userIds = [recipientProfileId];
  if (authUid && authUid !== recipientProfileId) userIds.push(authUid);

  for (const uid of userIds) {
    const snap = await db
      .collection('conversation_notification_prefs')
      .where('conversation_id', '==', conversationId)
      .where('user_id', '==', uid)
      .limit(1)
      .get();
    if (snap.empty) continue;
    const mutedUntil = asString(snap.docs[0].data().muted_until);
    if (mutedUntil && new Date(mutedUntil).getTime() > Date.now()) return true;
  }
  return false;
}

async function isViewingConversation(
  recipientProfileId: string,
  conversationId: string,
): Promise<boolean> {
  const presence = await db.collection('users').doc(recipientProfileId).get();
  if (!presence.exists) return false;
  const data = presence.data() || {};
  // Backgrounded users should still receive push (Despia WebView may not fire visibilitychange).
  if (data.online === false) return false;
  if (asString(data.active_conversation) !== conversationId) return false;
  const updated = asString(data.updated_at) || asString(data.last_seen);
  if (!updated) return false;
  return Date.now() - new Date(updated).getTime() < PRESENCE_STALE_MS;
}

/** Server-side smart delivery — skip push when user is already engaged or blocked. */
export async function shouldSkipRecipientPush(
  input: SmartPushGateInput,
): Promise<{ skip: boolean; reason?: SmartPushSkipReason }> {
  const { recipientProfileId, senderProfileId, conversationId, type, checkActiveConversation } = input;

  if (await isBlockedEitherWay(recipientProfileId, senderProfileId)) {
    return { skip: true, reason: 'blocked' };
  }

  const dmLike =
    type === 'dm' ||
    type === 'group_message' ||
    type === 'typing' ||
    type === 'mention' ||
    type === 'reply';

  if (conversationId && dmLike) {
    if (checkActiveConversation !== false && (await isViewingConversation(recipientProfileId, conversationId))) {
      return { skip: true, reason: 'viewing_conversation' };
    }
    if (await isConversationMuted(recipientProfileId, conversationId)) {
      return { skip: true, reason: 'conversation_muted' };
    }
  }

  return { skip: false };
}

export async function logPushDelivery(entry: {
  profileId: string;
  type: string;
  success: boolean;
  channel: string;
  errorCode?: string;
  errorMessage?: string;
  conversationId?: string;
  messageId?: string;
}): Promise<void> {
  try {
    await db.collection('push_delivery_logs').add({
      ...entry,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[pushDeliveryLog] write failed', err);
  }
}
