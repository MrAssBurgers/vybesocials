import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { DocumentReference } from 'firebase-admin/firestore';
import { db, requireAuth } from './_shared/admin.js';
import { resolveProfileId } from './_shared/friendship.js';
import { isoDateOnly, weekStartIso, rotateChallengesCore } from './challenges.js';

const SYNC_COOLDOWN_MS = 60_000;

interface ProgressChange {
  challenge_id: string;
  previous_count: number;
  current_count: number;
  is_completed: boolean;
  newly_completed: boolean;
}

async function loadActiveChallenges(today: string, weekStart: string) {
  const [dailySnap, weeklySnap, achSnap] = await Promise.all([
    db.collection('challenges').where('type', '==', 'daily').where('is_active', '==', true)
      .where('active_date', '==', today).get(),
    db.collection('challenges').where('type', '==', 'weekly').where('is_active', '==', true)
      .where('active_week_start', '==', weekStart).get(),
    db.collection('challenges').where('type', '==', 'achievement').where('is_active', '==', true).get(),
  ]);
  return [
    ...dailySnap.docs,
    ...weeklySnap.docs,
    ...achSnap.docs,
  ].map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
}

async function countActivity(
  profileId: string,
  authUid: string,
  requirementType: string,
  sinceIso: string,
): Promise<number> {
  try {
    switch (requirementType) {
      case 'post':
      case 'clip':
      case 'story': {
        const snap = await db.collection('posts')
          .where('author_id', '==', profileId)
          .where('created_at', '>=', sinceIso)
          .limit(200)
          .get();
        return snap.docs.filter((d) => {
          const row = d.data();
          const postType = String(row.post_type || row.type || row.media_type || 'post');
          if (requirementType === 'clip') {
            return postType === 'short' || postType === 'video' || postType === 'clip';
          }
          if (requirementType === 'story') return postType === 'story';
          return postType !== 'story' && postType !== 'short' && postType !== 'video' && postType !== 'clip';
        }).length;
      }
      case 'comment': {
        const snap = await db.collection('comments')
          .where('user_id', '==', profileId)
          .where('created_at', '>=', sinceIso)
          .limit(200)
          .get();
        return snap.size;
      }
      case 'like':
      case 'react': {
        const snap = await db.collection('post_reactions')
          .where('user_id', '==', profileId)
          .where('created_at', '>=', sinceIso)
          .limit(200)
          .get();
        return snap.size;
      }
      case 'follow': {
        const snap = await db.collection('follows')
          .where('follower_id', '==', profileId)
          .where('created_at', '>=', sinceIso)
          .limit(200)
          .get();
        return snap.size;
      }
      case 'message':
      case 'snap_sent':
      case 'new_conversation': {
        const snap = await db.collection('messages')
          .where('sender_id', '==', profileId)
          .where('created_at', '>=', sinceIso)
          .limit(200)
          .get();
        return snap.size;
      }
      case 'daily_login':
      case 'login': {
        const today = isoDateOnly();
        const byAuth = await db.collection('login_streaks').doc(authUid).get();
        if (byAuth.exists) {
          const last = byAuth.data()?.last_login_date
            ? String(byAuth.data()!.last_login_date).slice(0, 10)
            : null;
          if (last === today) return 1;
        }
        const byProfile = await db.collection('login_streaks').doc(profileId).get();
        if (byProfile.exists) {
          const last = byProfile.data()?.last_login_date
            ? String(byProfile.data()!.last_login_date).slice(0, 10)
            : null;
          if (last === today) return 1;
        }
        return 0;
      }
      default:
        return 0;
    }
  } catch (err) {
    // Missing composite indexes (or transient query errors) must not 500 the whole sync.
    console.warn('[countActivity] failed', { requirementType, profileId, err });
    return 0;
  }
}

function periodStartIso(challenge: Record<string, unknown>): string {
  if (challenge.type === 'daily' && challenge.active_date) {
    return `${String(challenge.active_date).slice(0, 10)}T00:00:00.000Z`;
  }
  if (challenge.type === 'weekly' && challenge.active_week_start) {
    return `${String(challenge.active_week_start).slice(0, 10)}T00:00:00.000Z`;
  }
  return '1970-01-01T00:00:00.000Z';
}

async function ensureCompletionReward(
  authUid: string,
  challenge: Record<string, unknown>,
  now: string,
): Promise<void> {
  const challengeId = String(challenge.id);
  const rewardId = `${authUid}_${challengeId}`;
  const rewardRef = db.collection('challenge_rewards').doc(rewardId);
  const rewardSnap = await rewardRef.get();
  if (rewardSnap.exists) return;

  await rewardRef.set({
    id: rewardId,
    user_id: authUid,
    challenge_id: challengeId,
    xp_amount: Number(challenge.reward_xp || 25),
    badge_id: challenge.reward_badge_id || null,
    is_claimed: false,
    claimed_at: null,
    created_at: now,
  });
}

async function upsertProgressFromCount(
  profileId: string,
  authUid: string,
  challenge: Record<string, unknown>,
  trustedCount: number,
): Promise<ProgressChange | null> {
  const challengeId = String(challenge.id);
  const reqCount = Number(challenge.requirement_count || 1);
  const now = new Date().toISOString();
  const progressId = `${profileId}_${challengeId}`;
  const progressRef = db.collection('challenge_progress').doc(progressId);
  const existing = await progressRef.get();
  const previousCount = Number(existing.data()?.current_count || 0);
  const wasCompleted = existing.exists && existing.data()?.is_completed === true;

  // Never lower valid progress — only raise when trusted activity proves it.
  const mergedCount = Math.min(reqCount, Math.max(previousCount, trustedCount));
  const completed = wasCompleted || mergedCount >= reqCount;
  const newlyCompleted = completed && !wasCompleted;

  if (
    existing.exists &&
    previousCount === mergedCount &&
    wasCompleted === completed
  ) {
    return null;
  }

  await progressRef.set({
    id: progressId,
    user_id: profileId,
    challenge_id: challengeId,
    current_count: mergedCount,
    is_completed: completed,
    completed_at: completed ? (existing.data()?.completed_at || now) : null,
    created_at: existing.data()?.created_at || now,
    updated_at: now,
  }, { merge: true });

  if (newlyCompleted) {
    await ensureCompletionReward(authUid, challenge, now);
  }

  return {
    challenge_id: challengeId,
    previous_count: previousCount,
    current_count: mergedCount,
    is_completed: completed,
    newly_completed: newlyCompleted,
  };
}

async function incrementOneChallenge(
  profileId: string,
  authUid: string,
  challenge: Record<string, unknown>,
  increment: number,
) {
  const challengeId = String(challenge.id);
  const reqCount = Number(challenge.requirement_count || 1);
  const now = new Date().toISOString();
  const progressId = `${profileId}_${challengeId}`;
  const progressRef = db.collection('challenge_progress').doc(progressId);

  return db.runTransaction(async (tx) => {
    const rewardId = `${authUid}_${challengeId}`;
    const rewardRef = db.collection('challenge_rewards').doc(rewardId);
    // Firestore requires all reads before any writes in a transaction.
    const [snap, rewardSnap] = await Promise.all([tx.get(progressRef), tx.get(rewardRef)]);
    const existing = snap.exists ? snap.data()! : null;
    if (existing?.is_completed) {
      return {
        is_completed: true,
        new_count: Number(existing.current_count || reqCount),
        was_already_completed: true,
      };
    }
    const prev = Number(existing?.current_count || 0);
    const newCount = Math.min(reqCount, prev + increment);
    const completed = newCount >= reqCount;

    tx.set(progressRef, {
      id: progressId,
      user_id: profileId,
      challenge_id: challengeId,
      current_count: newCount,
      is_completed: completed,
      completed_at: completed ? (existing?.completed_at || now) : null,
      created_at: existing?.created_at || now,
      updated_at: now,
    }, { merge: true });

    if (completed && !existing?.is_completed && !rewardSnap.exists) {
      tx.set(rewardRef, {
        id: rewardId,
        user_id: authUid,
        challenge_id: challengeId,
        xp_amount: Number(challenge.reward_xp || 25),
        badge_id: challenge.reward_badge_id || null,
        is_claimed: false,
        claimed_at: null,
        created_at: now,
      });
    }

    return { is_completed: completed, new_count: newCount, was_already_completed: false };
  });
}

async function levelFromXp(totalXp: number) {
  const tiersSnap = await db.collection('battle_pass_tiers').orderBy('level', 'asc').get();
  const tiers = tiersSnap.docs.map((d) => d.data());
  let level = 1;
  for (const tier of tiers) {
    const req = Number(tier.xp_required || 0);
    const tierLevel = Number(tier.level || 1);
    if (totalXp >= req) level = tierLevel;
  }
  return level;
}

async function resolveUserLevelRef(authUid: string, userId: string): Promise<DocumentReference> {
  const levelQuery = await db.collection('user_levels')
    .where('user_id', '==', userId)
    .limit(1)
    .get();
  if (levelQuery.docs[0]) return levelQuery.docs[0].ref;

  const profileId = await resolveProfileId(authUid);
  return db.collection('user_levels').doc(profileId);
}

async function readSyncMeta(authUid: string) {
  const ref = db.collection('_challenge_sync_meta').doc(authUid);
  const snap = await ref.get();
  return {
    ref,
    lastSyncAt: snap.data()?.last_sync_at ? String(snap.data()!.last_sync_at) : null,
  };
}

/**
 * Client-facing "record activity" endpoint. Historically it accepted an
 * arbitrary p_increment and applied it directly, which let a caller farm XP
 * without doing the underlying action. It now ignores any client-supplied
 * increment/challenge/user id and re-derives progress from server-verified
 * Firestore activity counts (same logic as syncMyChallengeProgress).
 */
export const incrementChallengeProgress = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileId(authUid);
  const today = isoDateOnly();
  const weekStart = weekStartIso();
  const active = await loadActiveChallenges(today, weekStart);

  const changes: ProgressChange[] = [];
  const newlyCompleted: string[] = [];
  for (const ch of active) {
    const reqType = String(ch.requirement_type || '');
    if (!reqType) continue;
    const since = periodStartIso(ch);
    const count = await countActivity(profileId, authUid, reqType, since);
    const change = await upsertProgressFromCount(profileId, authUid, ch, count);
    if (change) {
      changes.push(change);
      if (change.newly_completed) newlyCompleted.push(change.challenge_id);
    }
  }
  return { ok: true, matched: changes.length, changes, newly_completed: newlyCompleted };
});


export const syncMyChallengeProgress = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const force = Boolean((request.data as Record<string, unknown> | undefined)?.force);
  const syncedAt = new Date().toISOString();
  const { ref: metaRef, lastSyncAt } = await readSyncMeta(authUid);

  if (!force && lastSyncAt) {
    const elapsed = Date.now() - Date.parse(lastSyncAt);
    if (elapsed < SYNC_COOLDOWN_MS) {
      return {
        ok: true,
        skipped_cooldown: true,
        synced: 0,
        synced_at: syncedAt,
        last_sync_at: lastSyncAt,
        changes: [] as ProgressChange[],
        newly_completed: [] as string[],
      };
    }
  }

  const profileId = await resolveProfileId(authUid);
  await rotateChallengesCore();

  const today = isoDateOnly();
  const weekStart = weekStartIso();
  const active = await loadActiveChallenges(today, weekStart);

  const changes: ProgressChange[] = [];
  const newlyCompleted: string[] = [];

  for (const ch of active) {
    const reqType = String(ch.requirement_type || '');
    if (!reqType) continue;
    const since = periodStartIso(ch);
    const count = await countActivity(profileId, authUid, reqType, since);
    const change = await upsertProgressFromCount(profileId, authUid, ch, count);
    if (change) {
      changes.push(change);
      if (change.newly_completed) newlyCompleted.push(change.challenge_id);
    }
  }

  await metaRef.set({
    user_id: authUid,
    last_sync_at: syncedAt,
    updated_at: syncedAt,
  }, { merge: true });

  return {
    ok: true,
    skipped_cooldown: false,
    synced: active.length,
    synced_at: syncedAt,
    last_sync_at: syncedAt,
    changes,
    newly_completed: newlyCompleted,
  };
});

export const claimChallengeReward = onCall({ region: 'us-central1' }, async (request) => {
  const authUid = requireAuth(request);
  const data = (request.data || {}) as Record<string, unknown>;
  const rewardId = String(data.p_reward_id || '');
  const userId = String(data.p_user_id || authUid);
  if (!rewardId) throw new HttpsError('invalid-argument', 'p_reward_id required');

  const rewardRef = db.collection('challenge_rewards').doc(rewardId);
  const rewardSnap = await rewardRef.get();
  if (!rewardSnap.exists) throw new HttpsError('not-found', 'Reward not found');
  const reward = rewardSnap.data()!;
  if (reward.user_id !== userId && reward.user_id !== authUid) {
    throw new HttpsError('permission-denied', 'Not your reward');
  }
  if (reward.is_claimed) {
    return { success: true, xp_gained: 0, already_claimed: true };
  }

  const xpGained = Number(reward.xp_amount || 0);
  const now = new Date().toISOString();
  const levelRef = await resolveUserLevelRef(authUid, userId);
  const levelSnap = await levelRef.get();
  const oldLevel = Number(levelSnap.data()?.current_level || 1);
  const oldXp = Number(levelSnap.data()?.total_xp || 0);
  const newXp = oldXp + xpGained;
  const newLevel = await levelFromXp(newXp);

  await levelRef.set({
    user_id: userId,
    total_xp: newXp,
    current_level: newLevel,
    updated_at: now,
  }, { merge: true });

  await rewardRef.update({ is_claimed: true, claimed_at: now });

  if (reward.badge_id) {
    const badgeId = String(reward.badge_id);
    await db.collection('user_badges').doc(`${userId}_${badgeId}`).set({
      user_id: userId,
      badge_id: badgeId,
      earned_at: now,
      is_primary: false,
    }, { merge: true });
  }

  try {
    const { applyVybeScoreEvent } = await import('./vybeScore.js');
    await applyVybeScoreEvent({
      userId,
      eventType: 'challenge_completed',
      sourceId: rewardId,
      idempotencyKey: `challenge:${rewardId}`,
      pointsOverride: Math.max(1, Math.round(xpGained / 2)),
    });
  } catch (err) {
    console.warn('[challenge] vybe score hook failed', err);
  }

  return {
    success: true,
    xp_gained: xpGained,
    level_result: {
      old_level: oldLevel,
      new_level: newLevel,
      total_xp: newXp,
      level_up: newLevel > oldLevel,
      new_rewards: [],
    },
  };
});
