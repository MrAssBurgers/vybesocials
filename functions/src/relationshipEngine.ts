import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { db, requireAuth } from './_shared/admin.js';
import { areFriends, friendshipPairId, resolveProfileId } from './_shared/friendship.js';
import {
  type BirthdaySemanticState,
  type FavoriteSemanticState,
  type InboxRelationshipFields,
  type PrimaryRelationshipState,
  type RelationshipEventType,
  type StreakSemanticState,
  BEST_FRIEND_SLOTS,
  MUTUAL_NUMBER_ONE_CLOSE_DAYS,
  MUTUAL_NUMBER_ONE_FOREVER_DAYS,
  RANK_STABILITY_DELTA,
  RECALC_DEBOUNCE_MS,
  RELATIONSHIP_EVENT_WEIGHTS,
  RELATIONSHIP_TITLE,
  ROLLING_WINDOW_MS,
  STREAK_RESTORATION_MS,
  STREAK_WARNING_MS,
  STREAK_WINDOW_MS,
} from './relationshipTypes.js';
import { DM_INBOX_COLLECTION } from './dmInboxProjection.js';

const RECALC_QUEUE = '_relationship_recalc_pending';
const DAILY_TEXT_CAP = 40;
const DAILY_REACTION_CAP = 25;

export function sortedPairId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function relationshipScoreDocId(viewerId: string, friendId: string): string {
  return `${viewerId}_${friendId}`;
}

export function eventDocId(eventType: string, sourceId: string, actorId: string): string {
  return `${eventType}:${sourceId}:${actorId}`;
}

export async function isRelationshipEngineWriteEnabled(): Promise<boolean> {
  try {
    const snap = await db.collection('app_config').doc('relationship_rollout').get();
    if (snap.exists && snap.data()?.relationship_engine_write === true) return true;
  } catch {
    /* default off */
  }
  return process.env.RELATIONSHIP_ENGINE_WRITE === '1';
}

function decayFactor(occurredAt: string, nowMs: number): number {
  const age = nowMs - Date.parse(occurredAt);
  if (!Number.isFinite(age) || age < 0) return 1;
  const ratio = Math.min(1, age / ROLLING_WINDOW_MS);
  return 1 - ratio * 0.85;
}

function isQualifyingSnap(messageType: string, mediaType: string | null): boolean {
  const t = messageType.toLowerCase();
  if (t === 'vybe' || t === 'snap') return true;
  if (t === 'image' || t === 'video' || t === 'media') {
    return mediaType !== 'text';
  }
  return false;
}

export function mapDmSendToRelationshipEvent(
  messageType: string,
  mediaType: string | null,
  hasReply: boolean,
): RelationshipEventType | null {
  if (isQualifyingSnap(messageType, mediaType)) {
    return hasReply ? 'snap_reply' : 'snap_sent';
  }
  const t = messageType.toLowerCase();
  if (t === 'voice' || t === 'audio') return 'voice_message';
  if (t === 'text' || t === 'media') return 'message_sent';
  if (t === 'shared_post' || t === 'shared_clip') return 'shared_post_reply';
  return null;
}

async function isBlockedPair(a: string, b: string): Promise<boolean> {
  const [ab, ba] = await Promise.all([
    db.collection('blocked_users').where('blocker_id', '==', a).where('blocked_id', '==', b).limit(1).get(),
    db.collection('blocked_users').where('blocker_id', '==', b).where('blocked_id', '==', a).limit(1).get(),
  ]);
  return !ab.empty || !ba.empty;
}

async function assertCanScore(actorId: string, friendId: string): Promise<boolean> {
  if (!actorId || !friendId || actorId === friendId) return false;
  if (await isBlockedPair(actorId, friendId)) return false;
  return areFriends(actorId, friendId);
}

async function underDailyCap(
  viewerId: string,
  eventType: RelationshipEventType,
  dayKey: string,
): Promise<boolean> {
  if (eventType === 'message_sent' || eventType === 'message_received') {
    const ref = db.collection('relationship_daily_caps').doc(`${viewerId}_${dayKey}`);
    const snap = await ref.get();
    const count = Number(snap.data()?.text_messages || 0);
    if (count >= DAILY_TEXT_CAP) return false;
    await ref.set({ text_messages: count + 1, updated_at: new Date().toISOString() }, { merge: true });
    return true;
  }
  if (eventType === 'reaction') {
    const ref = db.collection('relationship_daily_caps').doc(`${viewerId}_${dayKey}`);
    const snap = await ref.get();
    const count = Number(snap.data()?.reactions || 0);
    if (count >= DAILY_REACTION_CAP) return false;
    await ref.set({ reactions: count + 1, updated_at: new Date().toISOString() }, { merge: true });
    return true;
  }
  return true;
}

async function incrementRelationshipScore(
  viewerId: string,
  friendId: string,
  eventType: RelationshipEventType,
  points: number,
  occurredAt: string,
): Promise<void> {
  const weighted = points * decayFactor(occurredAt, Date.now());
  const ref = db.collection('relationship_scores').doc(relationshipScoreDocId(viewerId, friendId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data() || {};
    const isSnap = eventType.startsWith('snap');
    const isCall = eventType.includes('call');
    await tx.set(ref, {
      viewer_id: viewerId,
      friend_id: friendId,
      rolling_score: Number(prev.rolling_score || 0) + weighted,
      snap_score: Number(prev.snap_score || 0) + (isSnap ? weighted : 0),
      chat_score: Number(prev.chat_score || 0) + (!isSnap && !isCall ? weighted : 0),
      call_score: Number(prev.call_score || 0) + (isCall ? weighted : 0),
      interaction_days: Number(prev.interaction_days || 0),
      last_meaningful_interaction_at: occurredAt,
      calculated_at: new Date().toISOString(),
    }, { merge: true });
  });
}

async function touchFriendshipStreak(
  pairId: string,
  actorId: string,
  occurredAt: string,
): Promise<void> {
  const ref = db.collection('friendship_streaks').doc(pairId);
  const ts = Date.parse(occurredAt);
  const parts = pairId.split('_');
  const a = parts[0];
  const actorIsA = actorId === a;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const lastA = data.last_qualified_send_at_a ? Date.parse(String(data.last_qualified_send_at_a)) : 0;
    const lastB = data.last_qualified_send_at_b ? Date.parse(String(data.last_qualified_send_at_b)) : 0;
    let streakDays = Number(data.current_streak_days || 0);
    const longest = Number(data.longest_streak_days || 0);
    let windowEnd = data.current_window_end ? Date.parse(String(data.current_window_end)) : 0;

    const otherLast = actorIsA ? lastB : lastA;
    const selfLast = actorIsA ? lastA : lastB;

    if (otherLast && ts - otherLast <= STREAK_WINDOW_MS) {
      if (!selfLast || ts - selfLast >= STREAK_WINDOW_MS) {
        streakDays = Math.max(1, streakDays + 1);
      }
      windowEnd = ts + STREAK_WINDOW_MS;
    } else if (!otherLast) {
      windowEnd = ts + STREAK_WINDOW_MS;
    }

    const patch: Record<string, unknown> = {
      user_pair_id: pairId,
      current_streak_days: streakDays,
      longest_streak_days: Math.max(longest, streakDays),
      current_window_end: new Date(windowEnd || ts + STREAK_WINDOW_MS).toISOString(),
      warning_at: new Date((windowEnd || ts + STREAK_WINDOW_MS) - STREAK_WARNING_MS).toISOString(),
      expires_at: new Date(windowEnd || ts + STREAK_WINDOW_MS).toISOString(),
      restoration_eligible_until: new Date((windowEnd || ts + STREAK_WINDOW_MS) + STREAK_RESTORATION_MS).toISOString(),
      last_streak_updated_at: occurredAt,
    };
    if (actorIsA) patch.last_qualified_send_at_a = occurredAt;
    else patch.last_qualified_send_at_b = occurredAt;
    tx.set(ref, patch, { merge: true });
  });
}

export async function enqueueRankRecalc(viewerId: string): Promise<void> {
  await db.collection(RECALC_QUEUE).doc(viewerId).set({
    viewer_id: viewerId,
    due_at_ms: Date.now() + RECALC_DEBOUNCE_MS,
    updated_at: new Date().toISOString(),
  }, { merge: true });
}

export async function recordRelationshipActivity(input: {
  actorId: string;
  friendId: string;
  eventType: RelationshipEventType;
  sourceId: string;
  occurredAt: string;
}): Promise<{ ok: boolean; skipped?: string }> {
  if (!(await isRelationshipEngineWriteEnabled())) {
    return { ok: false, skipped: 'engine_disabled' };
  }

  const { actorId, friendId, eventType, sourceId, occurredAt } = input;
  if (!(await assertCanScore(actorId, friendId))) {
    return { ok: false, skipped: 'not_friends_or_blocked' };
  }

  const id = eventDocId(eventType, sourceId, actorId);
  const eventRef = db.collection('relationship_activity_events').doc(id);
  if ((await eventRef.get()).exists) return { ok: true, skipped: 'duplicate' };

  const dayKey = occurredAt.slice(0, 10);
  if (!(await underDailyCap(actorId, eventType, dayKey))) {
    return { ok: false, skipped: 'daily_cap' };
  }

  const points = RELATIONSHIP_EVENT_WEIGHTS[eventType] ?? 0;
  await eventRef.set({
    id,
    actor_id: actorId,
    friend_id: friendId,
    event_type: eventType,
    source_id: sourceId,
    points,
    occurred_at: occurredAt,
    created_at: new Date().toISOString(),
  });

  await incrementRelationshipScore(actorId, friendId, eventType, points, occurredAt);

  const reverseType: RelationshipEventType | null =
    eventType === 'snap_sent' ? 'snap_received'
      : eventType === 'message_sent' ? 'message_received'
        : null;
  if (reverseType) {
    await incrementRelationshipScore(friendId, actorId, reverseType, points, occurredAt);
  }

  if (eventType === 'snap_sent' || eventType === 'snap_reply') {
    await touchFriendshipStreak(sortedPairId(actorId, friendId), actorId, occurredAt);
  }

  await enqueueRankRecalc(actorId);
  await enqueueRankRecalc(friendId);

  return { ok: true };
}

export async function recalculateRankingsForViewer(viewerId: string): Promise<void> {
  const all = await db.collection('relationship_scores')
    .where('viewer_id', '==', viewerId)
    .limit(100)
    .get();

  const ranked = all.docs
    .map((doc) => ({
      friendId: String(doc.data().friend_id || ''),
      score: Number(doc.data().rolling_score || 0),
      prevRank: null as number | null,
    }))
    .filter((r) => r.friendId && r.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const row of ranked) {
    const rankSnap = await db.collection('friendship_rankings')
      .doc(relationshipScoreDocId(viewerId, row.friendId))
      .get();
    row.prevRank = rankSnap.exists ? Number(rankSnap.data()?.rank ?? null) : null;
  }

  const top: typeof ranked = [];
  for (const row of ranked) {
    if (top.length >= BEST_FRIEND_SLOTS) break;
    if (top.length > 0) {
      const last = top[top.length - 1];
      const delta = Math.abs(row.score - last.score);
      if (delta < RANK_STABILITY_DELTA && row.prevRank != null && row.prevRank > BEST_FRIEND_SLOTS) {
        continue;
      }
    }
    top.push(row);
  }

  const now = new Date().toISOString();
  const batch = db.batch();
  for (let i = 0; i < top.length; i++) {
    const { friendId, score, prevRank } = top[i];
    batch.set(db.collection('friendship_rankings').doc(relationshipScoreDocId(viewerId, friendId)), {
      viewer_id: viewerId,
      friend_id: friendId,
      rank: i + 1,
      previous_rank: prevRank,
      score,
      is_rising: prevRank != null && prevRank > i + 1 + 2,
      is_cooling: false,
      entered_best_friends_at: now,
      calculated_at: now,
    }, { merge: true });
  }
  await batch.commit();

  for (const row of top) {
    await syncInboxRelationshipFields(viewerId, row.friendId);
    await updateMutualMilestones(viewerId, row.friendId, row.score > 0 ? 1 : null);
  }
}

async function updateMutualMilestones(
  viewerId: string,
  friendId: string,
  viewerRank: number | null,
): Promise<void> {
  if (viewerRank !== 1) return;
  const otherRankSnap = await db.collection('friendship_rankings')
    .doc(relationshipScoreDocId(friendId, viewerId))
    .get();
  if (!otherRankSnap.exists || Number(otherRankSnap.data()?.rank) !== 1) return;

  const pairId = sortedPairId(viewerId, friendId);
  const ref = db.collection('friendship_milestones').doc(pairId);
  const snap = await ref.get();
  const prev = snap.data() || {};
  const started = (prev.mutual_number_one_started_at as string) || new Date().toISOString();
  const days = Math.floor((Date.now() - Date.parse(started)) / (24 * 60 * 60 * 1000));
  let level: PrimaryRelationshipState = 'mutual_number_one';
  if (days >= MUTUAL_NUMBER_ONE_FOREVER_DAYS) level = 'forever_number_one';
  else if (days >= MUTUAL_NUMBER_ONE_CLOSE_DAYS) level = 'close_number_one';

  await ref.set({
    user_pair_id: pairId,
    mutual_number_one_started_at: started,
    mutual_number_one_days: days,
    longest_mutual_number_one_days: Math.max(Number(prev.longest_mutual_number_one_days || 0), days),
    current_level: level,
    updated_at: new Date().toISOString(),
  }, { merge: true });
}

function computeBirthdayState(
  dateOfBirth: string | null | undefined,
  timezone?: string | null,
): BirthdaySemanticState {
  if (!dateOfBirth) return null;
  const tz = timezone || 'UTC';
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit', day: '2-digit' });
    const today = fmt.format(now);
    const match = dateOfBirth.match(/^\d{4}-(\d{2})-(\d{2})/);
    if (!match) return null;
    const bday = `${match[1]}-${match[2]}`;
    if (today.slice(5) === bday) return 'today';
    return null;
  } catch {
    return null;
  }
}

export async function deriveInboxRelationshipFields(
  viewerId: string,
  friendId: string,
): Promise<InboxRelationshipFields> {
  const rankSnap = await db.collection('friendship_rankings')
    .doc(relationshipScoreDocId(viewerId, friendId))
    .get();
  const rank = rankSnap.exists ? Number(rankSnap.data()?.rank ?? null) : null;
  const isRising = Boolean(rankSnap.data()?.is_rising);
  const enteredAt = rankSnap.data()?.entered_best_friends_at as string | undefined;

  const pairId = sortedPairId(viewerId, friendId);
  const [milestoneSnap, streakSnap, prefsSnap, friendPrefsSnap, profileSnap] = await Promise.all([
    db.collection('friendship_milestones').doc(pairId).get(),
    db.collection('friendship_streaks').doc(pairId).get(),
    db.collection('friendship_preferences').doc(viewerId).get(),
    db.collection('friendship_preferences').doc(friendId).get(),
    db.collection('profiles').doc(friendId).get(),
  ]);

  const milestone = milestoneSnap.data();
  const streak = streakSnap.data();
  const pinned = prefsSnap.data()?.pinned_friend_id === friendId;
  const friendPinned = friendPrefsSnap.data()?.pinned_friend_id === viewerId;

  let primary: PrimaryRelationshipState | null = null;
  if (milestone?.current_level) {
    primary = milestone.current_level as PrimaryRelationshipState;
  } else if (rank === 1) {
    primary = 'number_one';
  } else if (rank != null && rank <= BEST_FRIEND_SLOTS) {
    if (enteredAt && Date.now() - Date.parse(enteredAt) < 7 * 24 * 60 * 60 * 1000) {
      primary = 'new_close_friend';
    } else if (isRising) {
      primary = 'rising_friend';
    } else {
      primary = 'best_friend';
    }
  }

  const otherRankSnap = await db.collection('friendship_rankings')
    .doc(relationshipScoreDocId(friendId, viewerId))
    .get();
  const otherRank = otherRankSnap.exists ? Number(otherRankSnap.data()?.rank) : null;
  if (rank === 1 && otherRank === 1) primary = 'mutual_number_one';
  if (rank != null && rank <= BEST_FRIEND_SLOTS && otherRank != null && otherRank <= BEST_FRIEND_SLOTS) {
    if (primary === 'best_friend') primary = 'mutual_best_friend';
  }

  if (Boolean(prefsSnap.data()?.show_cooling_down) && rankSnap.data()?.is_cooling) {
    primary = 'cooling_down';
  }

  let streak_state: StreakSemanticState = null;
  const streak_count = Number(streak?.current_streak_days || 0);
  const expiresAt = streak?.expires_at ? Date.parse(String(streak.expires_at)) : 0;
  const restorationUntil = streak?.restoration_eligible_until
    ? Date.parse(String(streak.restoration_eligible_until))
    : 0;
  const now = Date.now();
  if (streak_count > 0 && expiresAt > now) {
    streak_state = expiresAt - now <= STREAK_WARNING_MS ? 'warning' : 'active';
  } else if (streak_count > 0 && restorationUntil > now) {
    streak_state = 'restoration_eligible';
  } else if (streak_count > 0) {
    streak_state = 'expired';
  }

  const profile = profileSnap.data();
  const birthday_state = computeBirthdayState(
    profile?.date_of_birth as string | undefined,
    profile?.timezone as string | undefined,
  );

  let favorite_state: FavoriteSemanticState = null;
  if (pinned && friendPinned) favorite_state = 'mutual_pinned';
  else if (pinned) favorite_state = 'pinned';

  return {
    primary_relationship_state: primary,
    best_friend_rank: rank,
    relationship_title: primary ? RELATIONSHIP_TITLE[primary] : null,
    streak_count,
    streak_state,
    birthday_state,
    favorite_state,
  };
}

export async function syncInboxRelationshipFields(
  viewerId: string,
  friendId: string,
): Promise<void> {
  if (!(await isRelationshipEngineWriteEnabled())) return;

  const fields = await deriveInboxRelationshipFields(viewerId, friendId);
  const convIds = [friendshipPairId(viewerId, friendId), sortedPairId(viewerId, friendId)];

  for (const convId of convIds) {
    const entryId = `${viewerId}_${convId}`;
    const ref = db.collection(DM_INBOX_COLLECTION).doc(entryId);
    if (!(await ref.get()).exists) continue;
    await ref.set({
      ...fields,
      relationship_updated_at: new Date().toISOString(),
    }, { merge: true });
    return;
  }
}

export const scheduledRelationshipRankRecalc = onSchedule(
  { schedule: 'every 2 minutes', region: 'us-central1' },
  async () => {
    if (!(await isRelationshipEngineWriteEnabled())) return;
    const now = Date.now();
    const snap = await db.collection(RECALC_QUEUE)
      .where('due_at_ms', '<=', now)
      .limit(25)
      .get();
    for (const doc of snap.docs) {
      const viewerId = String(doc.data().viewer_id || doc.id);
      try {
        await recalculateRankingsForViewer(viewerId);
        await doc.ref.delete();
      } catch (err) {
        console.error('[relationship] recalc failed', viewerId, err);
      }
    }
  },
);

export const scheduledRelationshipReconciliation = onSchedule(
  { schedule: '0 6 * * *', region: 'us-central1', timeZone: 'UTC' },
  async () => {
    if (!(await isRelationshipEngineWriteEnabled())) return;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const active = await db.collection('relationship_scores')
      .where('last_meaningful_interaction_at', '>=', since)
      .limit(200)
      .get();
    const viewers = new Set<string>();
    for (const doc of active.docs) {
      viewers.add(String(doc.data().viewer_id));
    }
    for (const viewerId of viewers) {
      await recalculateRankingsForViewer(viewerId);
    }
  },
);

export const updateFriendshipPreferences = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileId(authUid);
  const data = (request.data || {}) as {
    show_cooling_down?: boolean;
    pinned_friend_id?: string | null;
  };
  const patch: Record<string, unknown> = {
    viewer_id: profileId,
    updated_at: new Date().toISOString(),
  };
  if (typeof data.show_cooling_down === 'boolean') {
    patch.show_cooling_down = data.show_cooling_down;
  }
  if (data.pinned_friend_id === null) {
    patch.pinned_friend_id = null;
  } else if (typeof data.pinned_friend_id === 'string' && data.pinned_friend_id) {
    if (!(await areFriends(profileId, data.pinned_friend_id))) {
      throw new HttpsError('failed-precondition', 'Can only pin friends');
    }
    patch.pinned_friend_id = data.pinned_friend_id;
  }
  await db.collection('friendship_preferences').doc(profileId).set(patch, { merge: true });
  if (typeof patch.pinned_friend_id === 'string') {
    await syncInboxRelationshipFields(profileId, patch.pinned_friend_id);
  }
  return { ok: true };
});

export const updateFriendshipEmojiPreferences = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileId(authUid);
  const data = (request.data || {}) as Record<string, unknown>;
  const allowed = ['pack_id', 'states', 'streak', 'birthday', 'favorite', 'mutual_favorite'];
  const patch: Record<string, unknown> = {
    viewer_id: profileId,
    updated_at: new Date().toISOString(),
  };
  for (const key of allowed) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  await db.collection('friendship_emoji_preferences').doc(profileId).set(patch, { merge: true });
  return { ok: true };
});

export const pinFavoriteFriend = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileId(authUid);
  const friendId = String((request.data as { friend_id?: string })?.friend_id || '').trim();
  if (!friendId) throw new HttpsError('invalid-argument', 'friend_id required');
  if (!(await areFriends(profileId, friendId))) {
    throw new HttpsError('failed-precondition', 'Can only pin friends');
  }
  await db.collection('friendship_preferences').doc(profileId).set({
    viewer_id: profileId,
    pinned_friend_id: friendId,
    updated_at: new Date().toISOString(),
  }, { merge: true });
  await syncInboxRelationshipFields(profileId, friendId);
  return { ok: true };
});

export const getRelationshipState = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileId(authUid);
  const friendId = String((request.data as { friend_id?: string })?.friend_id || '').trim();
  if (!friendId) throw new HttpsError('invalid-argument', 'friend_id required');
  if (!(await areFriends(profileId, friendId))) {
    throw new HttpsError('permission-denied', 'Not friends');
  }
  const fields = await deriveInboxRelationshipFields(profileId, friendId);
  const pairId = sortedPairId(profileId, friendId);
  const [milestoneSnap, streakSnap] = await Promise.all([
    db.collection('friendship_milestones').doc(pairId).get(),
    db.collection('friendship_streaks').doc(pairId).get(),
  ]);
  return {
    ok: true,
    ...fields,
    milestone: milestoneSnap.data() || null,
    streak: streakSnap.data() || null,
  };
});

/** Record call minutes when a DM call ends (Firestore `calls` doc). */
export const onCallEndedRelationship = onDocumentUpdated(
  { document: 'calls/{callId}', region: 'us-central1' },
  async (event) => {
    if (!(await isRelationshipEngineWriteEnabled())) return;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const ended = ['ended', 'completed'].includes(String(after.status));
    const wasActive = !['ended', 'completed', 'declined', 'missed'].includes(String(before.status));
    if (!ended || !wasActive) return;

    const callerId = String(after.caller_id || '');
    const receiverId = String(after.receiver_id || '');
    if (!callerId || !receiverId) return;

    const durationSec = Number(after.duration_seconds || after.duration || 0);
    const minutes = Math.max(1, Math.ceil(durationSec / 60));
    const callType = String(after.call_type || 'audio');
    const eventType = callType === 'video' ? 'video_call_minute' : 'call_minute';
    const now = new Date().toISOString();

    for (let i = 0; i < minutes; i++) {
      await recordRelationshipActivity({
        actorId: callerId,
        friendId: receiverId,
        eventType,
        sourceId: `${event.params.callId}:m${i}`,
        occurredAt: now,
      });
    }

    try {
      const { applyVybeScoreEvent } = await import('./vybeScore.js');
      const scoreType = callType === 'video' ? 'video_call' : 'voice_call';
      await applyVybeScoreEvent({
        userId: callerId,
        eventType: scoreType,
        sourceId: event.params.callId,
        idempotencyKey: `call:${event.params.callId}:caller`,
        pointsOverride: minutes,
      });
    } catch {
      /* score optional */
    }
  },
);
