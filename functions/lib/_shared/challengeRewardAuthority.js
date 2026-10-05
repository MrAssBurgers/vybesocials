import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
import { assertTokenActor, tokenAuthorityId, validatedTokenBoostMultiplier } from './tokenCreditAuthority.js';
import { resolveIdentity } from './profileAudienceAuthority.js';
import { validPostPublication } from './postPublicationProof.js';
const MAX_ACTIVITY = 200;
const MAX_REWARD_XP = 100_000;
const AUTHORITY = '_challenge_reward_authority';
const aliases = ({ authUid, profileId }) => [...new Set([authUid, profileId])];
const review = () => new HttpsError('failed-precondition', 'This reward needs reconciliation. Please contact support.');
export const rewardAuthorityId = (authUid, challengeId) => createHash('sha256').update(JSON.stringify([authUid, challengeId])).digest('hex');
export function rewardDocumentId(value) {
    if (typeof value !== 'string' || !value || value.length > 512 || value.includes('/')) {
        throw new HttpsError('invalid-argument', 'Invalid reward or challenge ID');
    }
    return value;
}
function integer(value, min, max) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
        throw review();
    return value;
}
function day(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw review();
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
        throw review();
    return ms;
}
function definition(id, row, nowMs) {
    const requirement = String(row.requirement_type || '');
    if (!['post', 'clip', 'story', 'comment', 'like', 'react', 'follow', 'message', 'snap_sent', 'new_conversation', 'daily_login', 'login'].includes(requirement))
        throw review();
    const required = integer(row.requirement_count, 1, MAX_ACTIVITY);
    const xp = integer(row.reward_xp, 0, MAX_REWARD_XP);
    const badge = row.reward_badge_id == null ? null : rewardDocumentId(row.reward_badge_id);
    let start = 0;
    let end = nowMs + 1;
    if (row.type === 'daily' || row.type === 'weekly') {
        start = day(row.type === 'daily' ? row.active_date : row.active_week_start);
        end = start + (row.type === 'daily' ? 1 : 7) * 86_400_000;
    }
    else if (row.type !== 'achievement')
        throw review();
    if (row.ends_at != null) {
        const expires = Date.parse(String(row.ends_at));
        if (!Number.isFinite(expires))
            throw review();
        end = Math.min(end, expires);
    }
    if (start >= end || start > nowMs)
        throw review();
    return { id, requirement, required, xp, badge, start, end };
}
// Firestore's createTime is server metadata. Editing an old row's created_at
// cannot move it into a new challenge period. Counters never prove activity.
function createdInWindow(doc, start, end, now) {
    const created = doc.createTime.toMillis();
    return created >= start && created < end && created <= now;
}
async function activityCount(tx, db, actor, challenge, now) {
    const kind = challenge.requirement;
    if (kind === 'login' || kind === 'daily_login') {
        // This authenticated server request proves today's login, not editable
        // login_streak counters. Old login periods require operator reconciliation.
        return now >= challenge.start && now < challenge.end ? 1 : 0;
    }
    const source = kind === 'story' ? ['stories', 'author_id']
        : kind === 'post' || kind === 'clip' ? ['posts', 'author_id']
            : kind === 'comment' ? ['comments', 'user_id']
                : kind === 'like' || kind === 'react' ? ['post_reactions', 'user_id']
                    : kind === 'follow' ? ['follows', 'follower_id']
                        : kind === 'new_conversation' ? ['conversations', 'created_by']
                            : ['messages', 'sender_id'];
    const ownerIds = aliases(actor);
    const snapshot = await tx.get(db.collection(source[0])
        .where(source[1], 'in', ownerIds)
        .where('created_at', '>=', new Date(challenge.start).toISOString())
        .limit(MAX_ACTIVITY));
    const unique = new Set();
    const publicationOwner = kind === 'post' || kind === 'clip' ? await resolveIdentity(db, tx, actor.authUid) : null;
    const profileCache = new Map();
    const postCache = new Map();
    const liveRow = (row) => !row.deleted_at && row.is_deleted !== true && row.status !== 'draft';
    const targetProfileExists = (id) => {
        if (!id || id.length > 512 || id.includes('/') || ownerIds.includes(id))
            return Promise.resolve(false);
        let result = profileCache.get(id);
        if (!result) {
            result = (async () => {
                const [direct, byUid] = await Promise.all([
                    tx.get(db.collection('profiles').doc(id)), tx.get(db.collection('profiles').where('user_id', '==', id).limit(2)),
                ]);
                if (byUid.size > 1 || (direct.exists && byUid.size && direct.id !== byUid.docs[0].id))
                    return false;
                const profile = direct.exists ? direct : byUid.docs[0];
                const data = profile?.data();
                return !!data && typeof data.user_id === 'string' && !!data.user_id && !ownerIds.includes(data.user_id) && liveRow(data);
            })();
            profileCache.set(id, result);
        }
        return result;
    };
    const targetPostExists = (id) => {
        if (!id || id.length > 512 || id.includes('/'))
            return Promise.resolve(false);
        let result = postCache.get(id);
        if (!result) {
            result = (async () => {
                const target = (await tx.get(db.collection('posts').doc(id))).data();
                if (!target || !liveRow(target) || typeof target.author_id !== 'string' || !await targetProfileExists(target.author_id))
                    return false;
                const owner = await resolveIdentity(db, tx, target.author_id), proof = (await tx.get(db.collection('_post_publications').doc(id))).data();
                return !!owner && validPostPublication(target, proof, owner, id);
            })();
            postCache.set(id, result);
        }
        return result;
    };
    for (const doc of snapshot.docs) {
        const row = doc.data();
        if (!ownerIds.includes(String(row[source[1]])) || !createdInWindow(doc, challenge.start, challenge.end, now))
            continue;
        if (row.deleted_at || row.is_deleted === true || row.status === 'draft')
            continue;
        if (kind === 'post' || kind === 'clip') {
            const proof = (await tx.get(db.collection('_post_publications').doc(doc.id))).data();
            if (!publicationOwner || publicationOwner.profileId !== actor.profileId || !validPostPublication(row, proof, publicationOwner, doc.id))
                continue;
        }
        const postType = String(row.post_type || row.type || row.media_type || 'post');
        if (kind === 'clip' && !['short', 'video', 'clip'].includes(postType))
            continue;
        if (kind === 'post' && ['short', 'video', 'clip', 'story'].includes(postType))
            continue;
        if (kind === 'snap_sent' && row.message_type !== 'vybe')
            continue;
        // Repeated reactions/follows on the same target count once, even when a
        // legacy client was able to create duplicate rows with arbitrary IDs.
        const target = kind === 'follow' ? row.following_id
            : kind === 'like' || kind === 'react' ? row.post_id : doc.id;
        if (kind === 'follow' && (typeof target !== 'string' || !await targetProfileExists(target)))
            continue;
        if ((kind === 'like' || kind === 'react' || kind === 'comment') && (typeof row.post_id !== 'string' || !await targetPostExists(row.post_id)))
            continue;
        if (typeof target === 'string' && target && !ownerIds.includes(target))
            unique.add(target);
        if (unique.size >= challenge.required)
            break;
    }
    return Math.min(unique.size, challenge.required);
}
function validateAuthority(row, actor, challengeId) {
    if (row.auth_uid !== actor.authUid || row.profile_id !== actor.profileId || row.challenge_id !== challengeId || row.version !== 1)
        throw review();
    integer(row.xp_amount, 0, MAX_REWARD_XP);
    integer(row.requirement_count, 1, MAX_ACTIVITY);
    if (row.badge_id != null)
        rewardDocumentId(row.badge_id);
    if (typeof row.is_claimed !== 'boolean')
        throw review();
    if (row.awarded_xp != null && (integer(row.awarded_xp, 0, MAX_REWARD_XP * 2) !== Number(row.xp_amount) * Number(row.xp_multiplier)
        || ![1, 2].includes(Number(row.xp_multiplier)) || row.is_claimed !== true))
        throw review();
    if (row.awarded_badge_id != null && (rewardDocumentId(row.awarded_badge_id) !== row.badge_id || row.is_claimed !== true))
        throw review();
}
function badgeSuppressed(proof, actor, badgeId, nowMs) {
    if (!proof)
        return false;
    const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    if (proof.schema_version !== 1 || proof.source !== 'staff' || proof.user_id !== actor.authUid || proof.profile_id !== actor.profileId
        || proof.badge_id !== badgeId || typeof proof.issued_by !== 'string' || !proof.issued_by || !date(proof.issued_at)
        || typeof proof.active !== 'boolean' || !(proof.expires_at === null || date(proof.expires_at))
        || (proof.active ? proof.revoked_at !== null || typeof proof.grant_id !== 'string' || !proof.grant_id : !date(proof.revoked_at)))
        throw review();
    return !proof.active || (typeof proof.expires_at === 'string' && Date.parse(proof.expires_at) <= nowMs);
}
/** Issue proof and its public UI mirrors in one transaction. Never reuse an
 * old client-written counter or claimed amount as evidence of completion. */
export async function reconcileChallenge(db, actor, challengeId, nowMs = Date.now()) {
    rewardDocumentId(challengeId);
    const id = `${actor.authUid}_${challengeId}`;
    const now = new Date(nowMs).toISOString();
    const grantRef = db.collection(AUTHORITY).doc(rewardAuthorityId(actor.authUid, challengeId));
    const progressRef = db.collection('challenge_progress').doc(`${actor.profileId}_${challengeId}`);
    const rewardRef = db.collection('challenge_rewards').doc(id);
    return db.runTransaction(async (tx) => {
        await assertTokenActor(tx, db, actor);
        const [grantSnap, progressSnap, challengeSnap, rewardSnap] = await Promise.all([
            tx.get(grantRef), tx.get(progressRef), tx.get(db.collection('challenges').doc(challengeId)), tx.get(rewardRef),
        ]);
        const previous = progressSnap.data();
        if (previous && (!aliases(actor).includes(String(previous.user_id)) || previous.challenge_id !== challengeId))
            throw review();
        const previousCount = typeof previous?.current_count === 'number' && Number.isFinite(previous.current_count) ? previous.current_count : 0;
        const existingGrant = grantSnap.data();
        if (existingGrant) {
            validateAuthority(existingGrant, actor, challengeId);
            return { challenge_id: challengeId, previous_count: previousCount, current_count: Number(existingGrant.requirement_count), is_completed: true, newly_completed: false };
        }
        if (!challengeSnap.exists)
            throw review();
        const challenge = definition(challengeId, challengeSnap.data(), nowMs);
        const legacy = await tx.get(db.collection('challenge_rewards')
            .where('user_id', 'in', aliases(actor)).where('challenge_id', '==', challengeId).limit(10));
        if (legacy.size >= 10)
            throw review();
        if (rewardSnap.exists && (!aliases(actor).includes(String(rewardSnap.data()?.user_id)) || rewardSnap.data()?.challenge_id !== challengeId))
            throw review();
        const previouslyClaimed = legacy.docs.some(doc => doc.data().is_claimed === true);
        const count = await activityCount(tx, db, actor, challenge, nowMs);
        const complete = previouslyClaimed || count >= challenge.required;
        // A claimed legacy receipt suppresses another award; it does not certify
        // or rewrite the account's historic XP. Existing balances remain intact.
        if (complete) {
            tx.create(grantRef, {
                version: 1, auth_uid: actor.authUid, profile_id: actor.profileId, challenge_id: challengeId,
                requirement_count: challenge.required, xp_amount: challenge.xp, badge_id: challenge.badge,
                is_claimed: previouslyClaimed, legacy_claimed: previouslyClaimed,
                earned_at: now, claimed_at: previouslyClaimed ? now : null,
            });
            tx.set(rewardRef, {
                id, user_id: actor.authUid, challenge_id: challengeId,
                xp_amount: challenge.xp, badge_id: challenge.badge,
                is_claimed: previouslyClaimed, claimed_at: previouslyClaimed ? now : null,
                created_at: typeof rewardSnap.data()?.created_at === 'string' ? rewardSnap.data().created_at : now,
            });
        }
        tx.set(progressRef, {
            id: progressRef.id, user_id: actor.profileId, challenge_id: challengeId,
            current_count: complete ? challenge.required : count, is_completed: complete,
            completed_at: complete ? now : null, created_at: previous?.created_at || now, updated_at: now,
        });
        return { challenge_id: challengeId, previous_count: previousCount,
            current_count: complete ? challenge.required : count, is_completed: complete,
            newly_completed: complete && !previouslyClaimed };
    });
}
/** Atomic consume/credit/badge grant. Existing historical XP is preserved; a
 * malformed, ambiguous, or squatted level row fails for operator review. */
export async function consumeChallengeReward(db, actor, rewardId, nowMs = Date.now()) {
    rewardDocumentId(rewardId);
    const rewardRef = db.collection('challenge_rewards').doc(rewardId);
    const initial = await rewardRef.get();
    if (!initial.exists)
        throw new HttpsError('not-found', 'Reward not found');
    const requested = initial.data();
    if (!aliases(actor).includes(String(requested.user_id)))
        throw new HttpsError('permission-denied', 'Not your reward');
    const challengeId = rewardDocumentId(requested.challenge_id);
    const id = `${actor.authUid}_${challengeId}`;
    const grantRef = db.collection(AUTHORITY).doc(rewardAuthorityId(actor.authUid, challengeId));
    // A legacy consumed receipt must not be revived, including when its old
    // challenge has already been deleted. No new credit is authorized here.
    if (requested.is_claimed === true && !(await grantRef.get()).exists) {
        return { success: true, challenge_id: challengeId, xp_gained: 0, already_claimed: true };
    }
    await reconcileChallenge(db, actor, challengeId, nowMs);
    const now = new Date(nowMs).toISOString();
    const verifiedRef = db.collection('_verified_xp_authority').doc(actor.authUid);
    return db.runTransaction(async (tx) => {
        await assertTokenActor(tx, db, actor);
        const [grantSnap, receiptSnap, levels, tiers, boostSnap, verifiedSnap] = await Promise.all([
            tx.get(grantRef), tx.get(rewardRef),
            tx.get(db.collection('user_levels').where('user_id', 'in', aliases(actor)).limit(3)),
            tx.get(db.collection('battle_pass_tiers').orderBy('level', 'asc').limit(500)),
            tx.get(db.collection('token_boosts').doc(tokenAuthorityId([actor.authUid, 'xp_2x']))), tx.get(verifiedRef),
        ]);
        const receipt = receiptSnap.data();
        if (!receipt || !aliases(actor).includes(String(receipt.user_id)) || receipt.challenge_id !== challengeId)
            throw new HttpsError('permission-denied', 'Reward changed');
        const grant = grantSnap.data();
        if (!grant)
            throw new HttpsError('failed-precondition', 'Challenge activity could not be verified. This reward needs reconciliation.');
        validateAuthority(grant, actor, challengeId);
        if (grant.is_claimed) {
            // Multiple migrated receipt IDs can point at this one consumed grant.
            // Settle the requested UI mirror without crediting the account again.
            if (receipt.is_claimed !== true)
                tx.update(rewardRef, {
                    is_claimed: true, claimed_at: grant.claimed_at || now, xp_amount: grant.awarded_xp ?? grant.xp_amount,
                    badge_id: Object.hasOwn(grant, 'awarded_badge_id') ? grant.awarded_badge_id : grant.badge_id,
                });
            return { success: true, challenge_id: challengeId, xp_gained: 0, already_claimed: true };
        }
        if (levels.size > 1)
            throw review();
        const levelRef = levels.docs[0]?.ref || db.collection('user_levels').doc(actor.profileId);
        const levelSnap = levels.docs[0] || await tx.get(levelRef);
        const level = levelSnap.data();
        if (level && !aliases(actor).includes(String(level.user_id)))
            throw review();
        const oldXp = level ? integer(level.total_xp, 0, Number.MAX_SAFE_INTEGER) : 0;
        const oldLevel = level ? integer(level.current_level, 1, Number.MAX_SAFE_INTEGER) : 1;
        const multiplier = validatedTokenBoostMultiplier(boostSnap.data(), actor.authUid, 'xp_2x', nowMs);
        const xp = integer(grant.xp_amount, 0, MAX_REWARD_XP) * multiplier;
        const total = integer(oldXp + xp, 0, Number.MAX_SAFE_INTEGER);
        const verified = verifiedSnap.data();
        if (verified && (verified.schema_version !== 1 || verified.user_id !== actor.authUid || verified.profile_id !== actor.profileId))
            throw review();
        // This new private ledger starts at zero; legacy levels and client-written
        // projected fields cannot certify earlier XP or shop eligibility.
        const verifiedTotal = integer((verified ? integer(verified.verified_total_xp, 0, Number.MAX_SAFE_INTEGER) : 0) + xp, 0, Number.MAX_SAFE_INTEGER);
        let newLevel = oldLevel;
        for (const tierDoc of tiers.docs) {
            const tier = tierDoc.data();
            const threshold = integer(tier.xp_required, 0, Number.MAX_SAFE_INTEGER);
            const tierLevel = integer(tier.level, 1, 100_000);
            if (total >= threshold)
                newLevel = Math.max(newLevel, tierLevel);
        }
        const badgeRef = grant.badge_id ? db.collection('user_badges').doc(`${actor.authUid}_${grant.badge_id}`) : null;
        const [badgeSnap, badgeProofSnap] = badgeRef ? await Promise.all([
            tx.get(badgeRef), tx.get(db.collection('_badge_grant_authority').doc(tokenAuthorityId([actor.authUid, String(grant.badge_id)]))),
        ]) : [undefined, undefined];
        const badge = badgeSnap?.data();
        if (badge && (!aliases(actor).includes(String(badge.user_id)) || badge.badge_id !== grant.badge_id))
            throw review();
        const suppressBadge = badgeSuppressed(badgeProofSnap?.data(), actor, grant.badge_id, nowMs);
        const awardedBadge = suppressBadge ? null : grant.badge_id;
        const result = { success: true, challenge_id: challengeId, xp_gained: xp, already_claimed: false,
            awarded_badge_id: awardedBadge, badge_suppressed: suppressBadge,
            level_result: { old_level: oldLevel, new_level: newLevel, total_xp: total, level_up: newLevel > oldLevel, new_rewards: [] } };
        tx.set(levelRef, {
            user_id: actor.authUid, profile_id: actor.profileId, total_xp: total,
            current_level: newLevel, updated_at: now, verified_total_xp: verifiedTotal, verified_xp_version: 1,
            ...(!level ? { id: levelRef.id, unclaimed_rewards: [], created_at: now } : {}),
        }, { merge: true });
        tx.set(verifiedRef, { schema_version: 1, user_id: actor.authUid, profile_id: actor.profileId, verified_total_xp: verifiedTotal, updated_at: now });
        tx.update(grantRef, { is_claimed: true, claimed_at: now, awarded_xp: xp, xp_multiplier: multiplier, awarded_badge_id: awardedBadge });
        const consumed = { is_claimed: true, claimed_at: now, xp_amount: xp, badge_id: awardedBadge };
        tx.update(rewardRef, consumed);
        if (rewardRef.id !== id)
            tx.set(db.collection('challenge_rewards').doc(id), consumed, { merge: true });
        if (badgeRef && !badge && !suppressBadge)
            tx.create(badgeRef, {
                user_id: actor.authUid, badge_id: grant.badge_id, earned_at: now, is_primary: false,
            });
        return result;
    });
}
//# sourceMappingURL=challengeRewardAuthority.js.map