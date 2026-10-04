import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { resolveProfileId } from './_shared/friendship.js';
import { isoDateOnly, weekStartIso, rotateChallengesCore } from './challenges.js';
import { consumeChallengeReward, reconcileChallenge, rewardDocumentId, type ProgressChange } from './_shared/challengeRewardAuthority.js';

const SYNC_COOLDOWN_MS = 60_000;

async function loadActiveChallenges(today: string, weekStart: string) {
  const snapshots = await Promise.all([
    db.collection('challenges').where('type', '==', 'daily').where('is_active', '==', true)
      .where('active_date', '==', today).limit(50).get(),
    db.collection('challenges').where('type', '==', 'weekly').where('is_active', '==', true)
      .where('active_week_start', '==', weekStart).limit(50).get(),
    db.collection('challenges').where('type', '==', 'achievement').where('is_active', '==', true).limit(50).get(),
  ]);
  return snapshots.flatMap(snapshot => snapshot.docs.map(doc => doc.id));
}

async function syncChallenges(authUid: string) {
  const profileId = await resolveProfileId(authUid);
  const active = await loadActiveChallenges(isoDateOnly(), weekStartIso());
  const changes: ProgressChange[] = [];
  const pendingReconciliation: string[] = [];
  for (const challengeId of active) {
    try {
      changes.push(await reconcileChallenge(db, { authUid, profileId }, challengeId));
    } catch (error) {
      if (!(error instanceof HttpsError) || error.code !== 'failed-precondition') throw error;
      pendingReconciliation.push(challengeId);
    }
  }
  return { synced: active.length, changes,
    newly_completed: changes.filter(change => change.newly_completed).map(change => change.challenge_id),
    pending_reconciliation: pendingReconciliation };
}

/** Kept for internal callers: increments never establish reward eligibility. */
export async function incrementOneChallenge(profileId: string, authUid: string, challenge: Record<string, unknown>, _increment: number) {
  const change = await reconcileChallenge(db, { authUid, profileId }, rewardDocumentId(challenge.id));
  return { is_completed: change.is_completed, new_count: change.current_count, was_already_completed: !change.newly_completed };
}

export const incrementChallengeProgress = onCall({ region: 'us-central1' }, async request => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`challenge-sync:${authUid}`, 6, 60));
  // No client user/challenge/increment/counter can grant progress or rewards.
  const result = await syncChallenges(authUid);
  return { ok: true, matched: result.changes.length, ...result };
});

export const syncMyChallengeProgress = onCall({ region: 'us-central1' }, async request => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`challenge-sync:${authUid}`, 6, 60));
  const force = (request.data as Record<string, unknown> | undefined)?.force === true;
  const syncedAt = new Date().toISOString();
  const metaRef = db.collection('_challenge_sync_meta').doc(authUid);
  const lastSyncAt = (await metaRef.get()).data()?.last_sync_at;
  if (!force && typeof lastSyncAt === 'string' && Date.now() - Date.parse(lastSyncAt) < SYNC_COOLDOWN_MS) {
    return { ok: true, skipped_cooldown: true, synced: 0, synced_at: syncedAt, last_sync_at: lastSyncAt,
      changes: [], newly_completed: [], pending_reconciliation: [] };
  }
  await rotateChallengesCore();
  const result = await syncChallenges(authUid);
  await metaRef.set({ user_id: authUid, last_sync_at: syncedAt, updated_at: syncedAt }, { merge: true });
  return { ok: true, skipped_cooldown: false, synced_at: syncedAt, ...result };
});

export const claimChallengeReward = onCall(
  { region: 'us-central1', memory: '256MiB', cpu: 0.5, timeoutSeconds: 60 },
  async request => {
    const authUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`challenge-claim:${authUid}`, 30, 60));
    const rewardId = rewardDocumentId((request.data as Record<string, unknown> | undefined)?.p_reward_id);
    const profileId = await resolveProfileId(authUid);
    const result = await consumeChallengeReward(db, { authUid, profileId }, rewardId);
    // Only the transaction winner runs this best-effort legacy score hook.
    // It is not the authority for XP, badges, or claiming the reward again.
    if (!result.already_claimed) {
      try {
        const { applyVybeScoreEvent } = await import('./vybeScore.js');
        await applyVybeScoreEvent({ userId: authUid, eventType: 'challenge_completed', sourceId: rewardId,
          idempotencyKey: `challenge:${rewardId}`, pointsOverride: Math.max(1, Math.round(result.xp_gained / 2)) });
      } catch (error) {
        console.warn('[challenge] vybe score hook failed', error);
      }
    }
    return result;
  },
);
