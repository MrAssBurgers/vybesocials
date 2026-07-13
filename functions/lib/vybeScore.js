import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, requireAdmin, requireAuth } from './_shared/admin.js';
import { resolveProfileId } from './_shared/friendship.js';
const EVENT_POINTS = {
    snap_sent: 2,
    snap_video_sent: 3,
    snap_opened: 1,
    snap_reply: 2,
    story_posted: 3,
    story_viewed: 0.5,
    post_created: 4,
    clip_created: 5,
    comment_created: 1,
    reply_received: 1,
    voice_message: 1,
    voice_call: 1,
    video_call: 1,
    daily_login: 1,
    login_streak_bonus: 5,
    challenge_completed: 0,
    friend_accepted: 1,
    friendship_milestone: 10,
    streak_milestone: 15,
    profile_completed: 20,
};
const EVENT_CATEGORY = {
    snap_sent: 'social',
    snap_video_sent: 'social',
    snap_opened: 'social',
    snap_reply: 'social',
    story_posted: 'creator',
    story_viewed: 'creator',
    post_created: 'creator',
    clip_created: 'creator',
    comment_created: 'social',
    reply_received: 'social',
    voice_message: 'connection',
    voice_call: 'connection',
    video_call: 'connection',
    daily_login: 'social',
    login_streak_bonus: 'social',
    challenge_completed: 'challenge',
    friend_accepted: 'connection',
    friendship_milestone: 'connection',
    streak_milestone: 'streak',
    profile_completed: 'community',
};
const DAILY_CAPS = {
    friend_accepted: 10,
    comment_created: 20,
    story_viewed: 30,
    voice_call: 30,
    video_call: 30,
};
const SCORE_MILESTONES = [
    100, 500, 1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000,
];
export async function isVybeScoreWriteEnabled() {
    try {
        const snap = await db.collection('app_config').doc('vybe_score_rollout').get();
        if (snap.exists && snap.data()?.vybe_score_write === true)
            return true;
    }
    catch {
        /* default off */
    }
    return process.env.VYBE_SCORE_WRITE === '1';
}
function categoryField(category) {
    return `${category}_score`;
}
export async function applyVybeScoreEvent(input) {
    if (!(await isVybeScoreWriteEnabled())) {
        return { ok: false, skipped: 'score_disabled' };
    }
    const { userId, eventType, sourceId, idempotencyKey } = input;
    if (!userId || !eventType || !idempotencyKey) {
        return { ok: false, skipped: 'invalid_input' };
    }
    if (eventType === 'message_sent') {
        return { ok: false, skipped: 'text_dm_excluded' };
    }
    const eventRef = db.collection('vybe_score_events').doc(idempotencyKey);
    if ((await eventRef.get()).exists) {
        return { ok: true, skipped: 'duplicate' };
    }
    const points = input.pointsOverride ?? EVENT_POINTS[eventType] ?? 0;
    if (points <= 0 && eventType !== 'challenge_completed') {
        return { ok: false, skipped: 'zero_points' };
    }
    const dayKey = new Date().toISOString().slice(0, 10);
    const cap = DAILY_CAPS[eventType];
    if (cap != null) {
        const capRef = db.collection('vybe_score_daily_limits').doc(`${userId}_${dayKey}`);
        const capSnap = await capRef.get();
        const field = `count_${eventType}`;
        const count = Number(capSnap.data()?.[field] || 0);
        if (count >= cap)
            return { ok: false, skipped: 'daily_cap' };
        await capRef.set({ [field]: count + 1, updated_at: new Date().toISOString() }, { merge: true });
    }
    const category = input.categoryOverride ?? EVENT_CATEGORY[eventType];
    const now = new Date().toISOString();
    await db.runTransaction(async (tx) => {
        const scoreRef = db.collection('vybe_scores').doc(userId);
        const scoreSnap = await tx.get(scoreRef);
        const prev = scoreSnap.data() || {};
        const catField = categoryField(category);
        const nextTotal = Number(prev.total_score ?? prev.score ?? 0) + points;
        tx.set(eventRef, {
            id: idempotencyKey,
            user_id: userId,
            event_type: eventType,
            source_id: sourceId,
            points,
            category,
            status: 'applied',
            created_at: now,
            applied_at: now,
        });
        tx.set(scoreRef, {
            user_id: userId,
            profile_id: userId,
            total_score: nextTotal,
            score: nextTotal,
            [catField]: Number(prev[catField] || 0) + points,
            last_event_at: now,
            last_calculated_at: now,
            version: Number(prev.version || 0) + 1,
        }, { merge: true });
    });
    await checkScoreMilestones(userId);
    return { ok: true, points };
}
async function checkScoreMilestones(userId) {
    const scoreSnap = await db.collection('vybe_scores').doc(userId).get();
    const total = Number(scoreSnap.data()?.total_score ?? scoreSnap.data()?.score ?? 0);
    for (const threshold of SCORE_MILESTONES) {
        if (total < threshold)
            break;
        const id = `${userId}_${threshold}`;
        const ref = db.collection('vybe_score_milestones').doc(id);
        if ((await ref.get()).exists)
            continue;
        await ref.set({
            user_id: userId,
            threshold,
            reached_at: new Date().toISOString(),
        });
    }
}
export const rebuildVybeScoreForUser = onCall({ region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
    await requireAdmin(request);
    const data = (request.data || {});
    const userId = data.userId?.trim();
    if (!userId)
        throw new HttpsError('invalid-argument', 'userId required');
    const events = await db.collection('vybe_score_events')
        .where('user_id', '==', userId)
        .where('status', '==', 'applied')
        .limit(5000)
        .get();
    const totals = {
        total_score: 0,
        social_score: 0,
        creator_score: 0,
        connection_score: 0,
        streak_score: 0,
        challenge_score: 0,
        community_score: 0,
    };
    for (const doc of events.docs) {
        const e = doc.data();
        const pts = Number(e.points || 0);
        totals.total_score += pts;
        const cat = String(e.category || 'social');
        totals[`${cat}_score`] = (totals[`${cat}_score`] || 0) + pts;
    }
    if (!data.dryRun) {
        await db.collection('vybe_scores').doc(userId).set({
            user_id: userId,
            profile_id: userId,
            ...totals,
            score: totals.total_score,
            last_calculated_at: new Date().toISOString(),
        }, { merge: true });
    }
    return { ok: true, dryRun: Boolean(data.dryRun), totals, eventCount: events.size };
});
export const updateVybeScorePreferences = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const privacy = String(request.data?.privacy || 'public');
    if (!['public', 'friends_only', 'private'].includes(privacy)) {
        throw new HttpsError('invalid-argument', 'Invalid privacy setting');
    }
    await db.collection('vybe_score_preferences').doc(profileId).set({
        user_id: profileId,
        privacy,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    return { ok: true };
});
export const scheduledVybeScoreReconciliation = onSchedule({ schedule: '0 7 * * *', region: 'us-central1', timeZone: 'UTC' }, async () => {
    if (!(await isVybeScoreWriteEnabled()))
        return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const snap = await db.collection('vybe_score_events')
        .where('created_at', '>=', since)
        .limit(1)
        .get();
    if (snap.empty)
        return;
    console.info('[vybeScore] reconciliation tick', snap.size);
});
//# sourceMappingURL=vybeScore.js.map