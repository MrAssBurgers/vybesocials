/**
 * Client-side daily brief builder — mirrors Supabase ai-catch-up when Cloud Function
 * is stubbed or GEMINI_API_KEY is missing on the server.
 */
import { db } from '@/lib/firebase';
import { invokeFunction } from './functionsService';
import { resolveProfileIdFromAuthUid } from './profileResolve';
import { getDocument, getDocuments, where, firestoreLimit } from './firestoreDb';

export interface BriefUpdate {
  interest: string;
  content: string;
  sources?: string[];
  category?: string;
}

export interface BriefPayload {
  summary: string;
  hasPosts: boolean;
  hasMessages: boolean;
  unreadCount?: number;
  notificationCount?: number;
  newFollowerCount?: number;
  recentPostCount?: number;
  pendingFriendRequests?: number;
  streak?: number;
  userLevel?: number;
  userXp?: number;
  activeChallenges?: Array<{ title: string; type: string; current: number; target: number; xp: number }>;
  liveUpdates: BriefUpdate[];
  hasLiveData: boolean;
  unreadMessagePreviews?: Array<{
    conversationId: string;
    senderName: string;
    preview: string;
    isGroup: boolean;
    groupName?: string;
    time: string;
  }>;
  notificationDetails?: Array<{ type: string; message: string; time: string }>;
}

function normalizeBrief(data: unknown): BriefPayload | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (obj.error === 'not_yet_ported' || obj.ok === false) return null;

  const liveRaw = obj.liveUpdates ?? obj.updates ?? obj.items ?? [];
  const liveUpdates: BriefUpdate[] = Array.isArray(liveRaw)
    ? liveRaw.map((u: any) => ({
        interest: String(u.interest || u.topic || 'News'),
        content: String(u.content || u.summary || ''),
        sources: Array.isArray(u.sources) ? u.sources.map(String) : [],
        category: u.category ? String(u.category) : undefined,
      }))
    : [];

  if (typeof obj.summary === 'string' || liveUpdates.length) {
    return {
      summary: String(obj.summary || ''),
      hasPosts: Boolean(obj.hasPosts),
      hasMessages: Boolean(obj.hasMessages),
      unreadCount: Number(obj.unreadCount || 0),
      notificationCount: Number(obj.notificationCount || 0),
      newFollowerCount: Number(obj.newFollowerCount || 0),
      recentPostCount: Number(obj.recentPostCount || 0),
      pendingFriendRequests: Number(obj.pendingFriendRequests || 0),
      streak: Number(obj.streak || 0),
      userLevel: Number(obj.userLevel || 1),
      userXp: Number(obj.userXp || 0),
      activeChallenges: Array.isArray(obj.activeChallenges) ? obj.activeChallenges as BriefPayload['activeChallenges'] : [],
      liveUpdates,
      hasLiveData: liveUpdates.length > 0 || Boolean(obj.hasLiveData),
      unreadMessagePreviews: Array.isArray(obj.unreadMessagePreviews) ? obj.unreadMessagePreviews as BriefPayload['unreadMessagePreviews'] : [],
      notificationDetails: Array.isArray(obj.notificationDetails) ? obj.notificationDetails as BriefPayload['notificationDetails'] : [],
    };
  }
  return null;
}

async function buildClientBrief(
  authUid: string,
  profileId: string,
  latitude?: number,
  longitude?: number,
): Promise<BriefPayload> {
  const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const profile = await getDocument<Record<string, unknown>>('profiles', profileId);

  const [notifs, friendReqs, follows, streakRow, levelRow, briefPrefs] = await Promise.all([
    getDocuments('notifications', [
      where('user_id', '==', profileId),
      firestoreLimit(50),
    ]),
    getDocuments('friend_requests', [
      where('receiver_id', '==', profileId),
      where('status', '==', 'pending'),
      firestoreLimit(20),
    ]),
    getDocuments('follows', [
      where('following_id', '==', profileId),
      firestoreLimit(100),
    ]),
    getDocument('login_streaks', profileId).catch(() => null),
    getDocument('user_levels', authUid).catch(() => null),
    getDocument('ai_brief_preferences', profileId).catch(() => null),
  ]);

  const unreadNotifs = notifs.filter((n) => !n.read);
  const newFollowers = follows.filter(
    (f) => f.created_at && String(f.created_at) >= oneDayAgo,
  );

  const memberships = await getDocuments('conversation_members', [
    where('user_id', '==', profileId),
    firestoreLimit(30),
  ]);

  let unreadConvos = 0;
  const unreadMessagePreviews: BriefPayload['unreadMessagePreviews'] = [];

  for (const m of memberships.slice(0, 10)) {
    const cid = String(m.conversation_id || '');
    if (!cid) continue;
    const lastRead = m.last_read_at ? new Date(String(m.last_read_at)).getTime() : 0;
    const msgs = await getDocuments('messages', [
      where('conversation_id', '==', cid),
      firestoreLimit(5),
    ]);
    const recent = msgs
      .filter((msg) => !msg.is_deleted)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    const latest = recent[0];
    if (!latest) continue;
    const latestMs = new Date(String(latest.created_at || 0)).getTime();
    if (latestMs > lastRead && String(latest.sender_id) !== profileId) {
      unreadConvos++;
      if (unreadMessagePreviews.length < 5) {
        unreadMessagePreviews.push({
          conversationId: cid,
          senderName: 'Someone',
          preview: String(latest.content || 'Sent a message').slice(0, 80),
          isGroup: false,
          time: String(latest.created_at || ''),
        });
      }
    }
  }

  const onboardingInterests = (profile?.interests as string[]) || [];
  const customTopics = (briefPrefs as Record<string, unknown> | null)?.custom_topics as string[] | undefined;
  const interests =
    customTopics?.length || onboardingInterests.length
      ? [...new Set([...(customTopics || []), ...onboardingInterests])].slice(0, 7)
      : ['technology', 'pop culture', 'breaking news'];

  let liveUpdates: BriefUpdate[] = [];
  try {
    const { data } = await invokeFunction('ai-catch-up', {
      interests,
      latitude,
      longitude,
      profile_id: profileId,
    });
    const normalized = normalizeBrief(data);
    if (normalized?.liveUpdates?.length) liveUpdates = normalized.liveUpdates;
    else if (Array.isArray((data as any)?.updates)) {
      liveUpdates = ((data as any).updates as any[]).map((u) => ({
        interest: String(u.interest || u.topic || 'News'),
        content: String(u.content || u.summary || ''),
        sources: Array.isArray(u.sources) ? u.sources : [],
      }));
    }
  } catch {
    /* optional cloud news */
  }

  const userName =
    String(profile?.display_name || profile?.username || 'there');
  const realNotifCount = unreadNotifs.length;
  const pendingFriendRequests = friendReqs.length;
  const newFollowerCount = newFollowers.length;
  const streak = Number((streakRow as Record<string, unknown> | null)?.current_streak || 0);
  const userLevel = Number((levelRow as Record<string, unknown> | null)?.current_level || 1);
  const userXp = Number((levelRow as Record<string, unknown> | null)?.total_xp || 0);

  const parts: string[] = [];
  if (realNotifCount > 0) parts.push(`${realNotifCount} notification${realNotifCount > 1 ? 's' : ''}`);
  if (unreadConvos > 0) parts.push(`${unreadConvos} unread message${unreadConvos > 1 ? 's' : ''}`);
  if (newFollowerCount > 0) parts.push(`${newFollowerCount} new follower${newFollowerCount > 1 ? 's' : ''}`);
  if (streak > 0) parts.push(`${streak}-day streak`);

  const summary =
    parts.length > 0
      ? `Hey ${userName}! You have ${parts.join(', ')}. Keep the momentum going!`
      : liveUpdates.length > 0
        ? `Hey ${userName}! Here's what's trending in your interests today.`
        : `Hey ${userName}! Everything's caught up — time to create something new!`;

  return {
    summary,
    hasPosts: false,
    hasMessages: unreadConvos > 0,
    unreadCount: unreadConvos,
    notificationCount: realNotifCount,
    newFollowerCount,
    recentPostCount: 0,
    pendingFriendRequests,
    streak,
    userLevel,
    userXp,
    activeChallenges: [],
    liveUpdates,
    hasLiveData: liveUpdates.length > 0,
    unreadMessagePreviews,
    notificationDetails: unreadNotifs.slice(0, 8).map((n) => ({
      type: String(n.type || 'general'),
      message: String(n.reason || n.message || ''),
      time: String(n.created_at || ''),
    })),
  };
}

/** Fetch daily brief — cloud first, client Firestore assembly as fallback. */
export async function fetchDailyBrief(
  authUid: string,
  opts?: { latitude?: number; longitude?: number },
): Promise<BriefPayload> {
  const profileId = (await resolveProfileIdFromAuthUid(authUid)) || authUid;

  try {
    const { data, error } = await invokeFunction('ai-catch-up', {
      latitude: opts?.latitude,
      longitude: opts?.longitude,
      profile_id: profileId,
    });
    if (!error) {
      const normalized = normalizeBrief(data);
      if (normalized && (normalized.summary || normalized.liveUpdates.length)) {
        return normalized;
      }
    }
  } catch {
    /* fall through */
  }

  return buildClientBrief(authUid, profileId, opts?.latitude, opts?.longitude);
}
