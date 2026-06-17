import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  where,
  firestoreLimit,
} from './firestoreDb';
import { firebaseAuth } from './authService';
import { getUserProfile, getUserProfileByUsername } from './users';

const SOCIAL_RPC_NAMES = new Set([
  'get_profile_by_username',
  'increment_view_count',
  'bump_post_impression',
  'ensure_user_level',
  'can_send_dm',
  'edit_message',
  'toggle_message_saved',
  'clear_conversation_messages',
  'get_own_sensitive_profile',
  'get_my_private_profile',
  'get_mutual_friends',
  'bump_reaction_streak',
  'track_daily_login',
  'get_login_streak_status',
  'update_login_streak',
  'restore_login_streak',
]);

export function isSocialRpc(name: string): boolean {
  return SOCIAL_RPC_NAMES.has(name);
}

async function currentUserId(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  return user?.id ?? null;
}

async function rpcGetProfileByUsername(params: Record<string, unknown>) {
  const username = String(params.target_username || params.username || '');
  if (!username) return null;
  return getUserProfileByUsername(username);
}

async function rpcIncrementViewCount(params: Record<string, unknown>) {
  const postId = String(params.post_id_param || params.p_post_id || params.post_id || '');
  if (!postId) return null;
  const post = await getDocument<Record<string, unknown>>('posts', postId);
  if (!post) return null;
  const next = Number(post.view_count || 0) + 1;
  await updateDocument('posts', postId, { view_count: next });
  return next;
}

async function rpcBumpPostImpression(params: Record<string, unknown>) {
  return rpcIncrementViewCount(params);
}

async function rpcEnsureUserLevel() {
  const uid = await currentUserId();
  if (!uid) return null;
  const existing = await getDocument('user_levels', uid);
  if (existing) return existing;
  const row = {
    id: uid,
    user_id: uid,
    level: 1,
    xp: 0,
    total_xp: 0,
    created_at: new Date().toISOString(),
  };
  await setDocument('user_levels', uid, row);
  return row;
}

async function rpcCanSendDm(params: Record<string, unknown>) {
  const uid = await currentUserId();
  const targetId = String(params.other_profile_id || params.target_id || '');
  if (!uid || !targetId) return { allowed: false, reason: 'not_authenticated' };
  return { allowed: true };
}

async function rpcEditMessage(params: Record<string, unknown>) {
  const messageId = String(params._message_id || params.message_id || '');
  const content = String(params._content ?? params.content ?? '');
  const uid = await currentUserId();
  if (!messageId || !uid) return null;
  const msg = await getDocument<Record<string, unknown>>('messages', messageId);
  if (!msg || msg.sender_id !== uid) return null;
  await updateDocument('messages', messageId, {
    content,
    is_edited: true,
    edited_at: new Date().toISOString(),
  });
  return { ok: true };
}

async function rpcToggleMessageSaved(params: Record<string, unknown>) {
  const messageId = String(params._message_id || params.message_id || '');
  const uid = await currentUserId();
  if (!messageId || !uid) return false;
  const msg = await getDocument<Record<string, unknown>>('messages', messageId);
  if (!msg) return false;
  const isSender = msg.sender_id === uid;
  const field = isSender ? 'saved_by_sender' : 'saved_by_recipient';
  const next = !msg[field];
  await updateDocument('messages', messageId, {
    [field]: next,
    saved_at: next ? new Date().toISOString() : null,
  });
  return next;
}

async function rpcClearConversationMessages(params: Record<string, unknown>) {
  const conversationId = String(params.p_conversation_id || params.conversation_id || '');
  const uid = await currentUserId();
  if (!conversationId || !uid) return null;
  const messages = await getDocuments<Record<string, unknown>>('messages', [
    where('conversation_id', '==', conversationId),
  ]);
  await Promise.all(
    messages.map((m) =>
      updateDocument('messages', String(m.id), { is_deleted: true }),
    ),
  );
  return { ok: true };
}

async function rpcGetOwnSensitiveProfile() {
  const uid = await currentUserId();
  if (!uid) return null;
  const profile = await getDocument<Record<string, unknown>>('profiles', uid);
  return {
    user_id: uid,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    tracking_consent: profile?.tracking_consent ?? null,
    cookie_consent: profile?.cookie_consent ?? null,
    crash_report_consent: profile?.crash_report_consent ?? null,
    ad_personalization: profile?.ad_personalization ?? null,
  };
}

async function rpcGetMyPrivateProfile() {
  const uid = await currentUserId();
  if (!uid) return null;
  const profile = await getDocument<Record<string, unknown>>('profiles', uid);
  return profile;
}

async function rpcGetMutualFriends(params: Record<string, unknown>) {
  const uid = await currentUserId();
  const targetId = String(params.target_id || params.other_profile_id || '');
  if (!uid || !targetId) return [];

  const [mySent, myRecv, theirSent, theirRecv] = await Promise.all([
    getDocuments<{ receiver_id?: string }>('friend_requests', [
      where('sender_id', '==', uid),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ sender_id?: string }>('friend_requests', [
      where('receiver_id', '==', uid),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ receiver_id?: string }>('friend_requests', [
      where('sender_id', '==', targetId),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ sender_id?: string }>('friend_requests', [
      where('receiver_id', '==', targetId),
      where('status', '==', 'accepted'),
    ]),
  ]);

  const myFriends = new Set<string>();
  for (const r of mySent) if (r.receiver_id) myFriends.add(r.receiver_id);
  for (const r of myRecv) if (r.sender_id) myFriends.add(r.sender_id);

  const theirFriends = new Set<string>();
  for (const r of theirSent) if (r.receiver_id) theirFriends.add(r.receiver_id);
  for (const r of theirRecv) if (r.sender_id) theirFriends.add(r.sender_id);

  const mutualIds = [...myFriends].filter((id) => theirFriends.has(id)).slice(0, 20);
  const profiles = await Promise.all(mutualIds.map((id) => getUserProfile(id)));
  return profiles.filter(Boolean);
}

async function rpcBumpReactionStreak() {
  return { ok: true };
}

async function rpcTrackDailyLogin() {
  return { ok: true, streak: 1 };
}

async function rpcGetLoginStreakStatus() {
  return { current_streak: 0, longest_streak: 0, can_restore: false };
}

async function rpcUpdateLoginStreak() {
  return { current_streak: 1, longest_streak: 1, xp_awarded: 0 };
}

async function rpcRestoreLoginStreak() {
  return { current_streak: 1, restored: false };
}

const HANDLERS: Record<string, (p: Record<string, unknown>) => Promise<unknown>> = {
  get_profile_by_username: rpcGetProfileByUsername,
  increment_view_count: rpcIncrementViewCount,
  bump_post_impression: rpcBumpPostImpression,
  ensure_user_level: async () => rpcEnsureUserLevel(),
  can_send_dm: rpcCanSendDm,
  edit_message: rpcEditMessage,
  toggle_message_saved: rpcToggleMessageSaved,
  clear_conversation_messages: rpcClearConversationMessages,
  get_own_sensitive_profile: async () => rpcGetOwnSensitiveProfile(),
  get_my_private_profile: async () => rpcGetMyPrivateProfile(),
  get_mutual_friends: rpcGetMutualFriends,
  bump_reaction_streak: async () => rpcBumpReactionStreak(),
  track_daily_login: async () => rpcTrackDailyLogin(),
  get_login_streak_status: async () => rpcGetLoginStreakStatus(),
  update_login_streak: async () => rpcUpdateLoginStreak(),
  restore_login_streak: async () => rpcRestoreLoginStreak(),
};

export async function runSocialRpc(
  name: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  const fn = HANDLERS[name];
  if (!fn) return null;
  try {
    return await fn(params);
  } catch (err) {
    console.warn(`[Social RPC] ${name} client fallback failed:`, err);
    return null;
  }
}
