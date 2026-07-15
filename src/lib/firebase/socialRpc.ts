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
import { getProfileByAuthUid, resolveProfileIdFromAuthUid } from './profileResolve';

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

async function currentAuthUid(): Promise<string | null> {
  const { data: { user } } = await firebaseAuth.getUser();
  return user?.id ?? null;
}

/** Social rows use profiles.id; resolve from auth UID when they differ. */
async function currentProfileId(): Promise<string | null> {
  const uid = await currentAuthUid();
  if (!uid) return null;
  return (await resolveProfileIdFromAuthUid(uid)) || uid;
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
  const uid = await currentAuthUid();
  const profileId = await currentProfileId();
  if (!uid || !profileId) return null;

  const byAuth = await getDocuments<Record<string, unknown>>('user_levels', [
    where('user_id', '==', uid),
    firestoreLimit(1),
  ]);
  if (byAuth[0]) return byAuth[0];

  const byProfile = await getDocuments<Record<string, unknown>>('user_levels', [
    where('user_id', '==', profileId),
    firestoreLimit(1),
  ]);
  if (byProfile[0]) return byProfile[0];

  const byDocId = await getDocument('user_levels', profileId);
  if (byDocId) return byDocId;

  const row = {
    id: profileId,
    user_id: uid,
    profile_id: profileId,
    current_level: 1,
    total_xp: 0,
    unclaimed_rewards: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await setDocument('user_levels', profileId, row);
  return row;
}

async function rpcCanSendDm(params: Record<string, unknown>) {
  const uid = await currentAuthUid();
  const targetId = String(params.other_profile_id || params.target_id || '');
  if (!uid || !targetId) return { allowed: false, reason: 'not_authenticated' };
  return { allowed: true };
}

async function rpcEditMessage(params: Record<string, unknown>) {
  const messageId = String(params._message_id || params.message_id || '');
  const content = String(params._content ?? params.content ?? '');
  const profileId = await currentProfileId();
  if (!messageId || !profileId) return null;
  const msg = await getDocument<Record<string, unknown>>('messages', messageId);
  if (!msg || msg.sender_id !== profileId) return null;
  await updateDocument('messages', messageId, {
    content,
    is_edited: true,
    edited_at: new Date().toISOString(),
  });
  return { ok: true };
}

async function rpcToggleMessageSaved(params: Record<string, unknown>) {
  const messageId = String(params._message_id || params.message_id || '');
  const profileId = await currentProfileId();
  if (!messageId || !profileId) return null;
  const msg = await getDocument<Record<string, unknown>>('messages', messageId);
  if (!msg) return null;
  const isSender = msg.sender_id === profileId;
  const senderField = 'saved_by_sender';
  const recipientField = 'saved_by_recipient';
  const field = isSender ? senderField : recipientField;
  const next = !msg[field];
  const nextSender = isSender ? next : !!msg[senderField];
  const nextRecipient = !isSender ? next : !!msg[recipientField];
  const stillSaved = nextSender || nextRecipient;
  const patch: Record<string, unknown> = {
    [field]: next,
    saved_at: stillSaved ? ((msg.saved_at as string | null) || new Date().toISOString()) : null,
  };
  if (next) {
    patch.expires_at = null;
  } else if (msg.view_mode === '24h' || msg.view_mode === 'timed') {
    const createdAt = (msg.created_at as string | null) || null;
    const viewedAt =
      (msg.viewed_at as string | null) ||
      (Array.isArray(msg.views)
        ? (msg.views as { user_id?: string; viewed_at?: string }[]).find(
            (v) => v.user_id !== msg.sender_id,
          )?.viewed_at
        : null) ||
      null;
    const base = createdAt || viewedAt;
    if (base) {
      patch.expires_at = new Date(
        new Date(base).getTime() + 24 * 60 * 60 * 1000,
      ).toISOString();
    } else if (msg.expires_at) {
      patch.expires_at = msg.expires_at;
    } else {
      patch.expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
  }
  await updateDocument('messages', messageId, patch);
  const updated = await getDocument<Record<string, unknown>>('messages', messageId);
  return {
    saved_by_sender: !!(updated?.saved_by_sender),
    saved_by_recipient: !!(updated?.saved_by_recipient),
    saved_at: (updated?.saved_at as string | null) ?? null,
    expires_at: (updated?.expires_at as string | null) ?? null,
  };
}

async function rpcClearConversationMessages(params: Record<string, unknown>) {
  const conversationId = String(params.p_conversation_id || params.conversation_id || '');
  const profileId = await currentProfileId();
  if (!conversationId || !profileId) return null;
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
  const uid = await currentAuthUid();
  const profile = uid ? await getProfileByAuthUid(uid) : null;
  if (!profile) return null;
  const p = profile as unknown as Record<string, unknown>;
  return {
    user_id: profile.id,
    email: (p.email as string | null | undefined) ?? null,
    phone: (p.phone as string | null | undefined) ?? null,
    tracking_consent: (p.tracking_consent as boolean | null | undefined) ?? null,
    cookie_consent: (p.cookie_consent as boolean | null | undefined) ?? null,
    crash_report_consent: (p.crash_report_consent as boolean | null | undefined) ?? null,
    ad_personalization: (p.ad_personalization as boolean | null | undefined) ?? null,
  };
}

async function rpcGetMyPrivateProfile() {
  const uid = await currentAuthUid();
  if (!uid) return null;
  return getProfileByAuthUid(uid);
}

async function rpcGetMutualFriends(params: Record<string, unknown>) {
  const profileId = await currentProfileId();
  const targetId = String(params.target_id || params.other_profile_id || '');
  if (!profileId || !targetId) return [];

  const [mySent, myRecv, theirSent, theirRecv] = await Promise.all([
    getDocuments<{ receiver_id?: string }>('friend_requests', [
      where('sender_id', '==', profileId),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ sender_id?: string }>('friend_requests', [
      where('receiver_id', '==', profileId),
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
  return rpcUpdateLoginStreak({});
}

function localTodayIso(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }
}

function streakExpiryIso(dateIso: string): string {
  const d = new Date(`${dateIso}T23:59:59`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function readLoginStreak(profileId: string, authUid: string | null) {
  if (authUid) {
    const byAuth = await getDocuments<Record<string, unknown>>('login_streaks', [
      where('user_id', '==', authUid),
      firestoreLimit(1),
    ]);
    if (byAuth[0]) return byAuth[0];
    const byAuthDoc = await getDocument<Record<string, unknown>>('login_streaks', authUid);
    if (byAuthDoc) return byAuthDoc;
  }

  const byProfile = await getDocuments<Record<string, unknown>>('login_streaks', [
    where('user_id', '==', profileId),
    firestoreLimit(1),
  ]);
  if (byProfile[0]) return byProfile[0];
  return getDocument<Record<string, unknown>>('login_streaks', profileId);
}

async function rpcGetLoginStreakStatus(params: Record<string, unknown>) {
  const profileId = await currentProfileId();
  const authUid = await currentAuthUid();
  if (!profileId) {
    return { success: false, streak: 0, longest_streak: 0, needs_login_today: false };
  }

  const timezone = String(params.p_timezone || 'UTC');
  const today = localTodayIso(timezone);
  const streak = await readLoginStreak(profileId, authUid);

  if (!streak) {
    return {
      success: true,
      streak: 0,
      longest_streak: 0,
      needs_login_today: true,
      hours_remaining: null,
    };
  }

  const current = Number(streak.current_streak || 0);
  const longest = Number(streak.longest_streak || 0);
  const lastLogin = streak.last_login_date ? String(streak.last_login_date).slice(0, 10) : null;
  const expiresAt = streak.streak_expires_at ? String(streak.streak_expires_at) : null;
  const hoursRemaining = expiresAt
    ? Math.max(0, (Date.parse(expiresAt) - Date.now()) / (1000 * 60 * 60))
    : null;

  return {
    success: true,
    streak: current,
    longest_streak: longest,
    needs_login_today: lastLogin !== today,
    hours_remaining: hoursRemaining,
    expires_at: expiresAt,
  };
}

async function rpcUpdateLoginStreak(params: Record<string, unknown>) {
  const profileId = await currentProfileId();
  const authUid = await currentAuthUid();
  if (!profileId || !authUid) {
    return { success: false, error: 'Not authenticated', streak: 0, longest_streak: 0 };
  }

  const timezone = String(params.p_timezone || 'UTC');
  const today = localTodayIso(timezone);
  const yesterday = (() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const existing = await readLoginStreak(profileId, authUid);
  const now = new Date().toISOString();
  const streakOwnerId = authUid;
  const streakDocId = String(existing?.id || authUid);

  if (!existing) {
    const row = {
      id: streakDocId,
      user_id: streakOwnerId,
      profile_id: profileId,
      current_streak: 1,
      longest_streak: 1,
      last_login_date: today,
      streak_expires_at: streakExpiryIso(today),
      created_at: now,
      updated_at: now,
    };
    await setDocument('login_streaks', streakDocId, row);
    return {
      success: true,
      streak: 1,
      longest_streak: 1,
      is_new_day: true,
      streak_extended: true,
    };
  }

  const lastLogin = existing.last_login_date ? String(existing.last_login_date).slice(0, 10) : null;
  if (lastLogin === today) {
    return {
      success: true,
      streak: Number(existing.current_streak || 0),
      longest_streak: Number(existing.longest_streak || 0),
      is_new_day: false,
      streak_extended: false,
    };
  }

  let nextStreak = 1;
  if (lastLogin === yesterday) {
    nextStreak = Number(existing.current_streak || 0) + 1;
  }
  const longest = Math.max(Number(existing.longest_streak || 0), nextStreak);

  await setDocument('login_streaks', streakDocId, {
    user_id: streakOwnerId,
    profile_id: profileId,
    current_streak: nextStreak,
    longest_streak: longest,
    last_login_date: today,
    streak_expires_at: streakExpiryIso(today),
    updated_at: now,
  });

  return {
    success: true,
    streak: nextStreak,
    longest_streak: longest,
    is_new_day: true,
    streak_extended: nextStreak > 1,
  };
}

async function rpcRestoreLoginStreak(params: Record<string, unknown>) {
  const profileId = await currentProfileId();
  const authUid = await currentAuthUid();
  if (!profileId || !authUid) return { success: false, restored: false, streak: 0 };

  const timezone = String(params.p_timezone || 'UTC');
  const today = localTodayIso(timezone);
  const existing = await readLoginStreak(profileId, authUid);
  if (!existing) return { success: false, restored: false, streak: 0 };

  const restored = Math.max(Number(existing.current_streak || 0), 1);
  await setDocument('login_streaks', String(existing.id || authUid), {
    user_id: authUid,
    profile_id: profileId,
    current_streak: restored,
    last_login_date: today,
    streak_expires_at: streakExpiryIso(today),
    updated_at: new Date().toISOString(),
  });

  return { success: true, restored: true, streak: restored };
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
  get_login_streak_status: rpcGetLoginStreakStatus,
  update_login_streak: rpcUpdateLoginStreak,
  restore_login_streak: rpcRestoreLoginStreak,
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
