import { HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'node:crypto';
export const tokenAuthorityId = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const DAY = 86_400_000;
const rates = {
    daily_login: { amount: 3, cap: 1, description: 'Daily login' },
    comment_added: { amount: 2, cap: 10, description: 'Verified comment' },
    post_created: { amount: 10, cap: 3, description: 'Verified post' },
    challenge_completed: { amount: 25, cap: 5, description: 'Claimed challenge' },
};
const review = () => new HttpsError('failed-precondition', 'Token account needs reconciliation. Please contact support.');
function id(value) {
    if (typeof value !== 'string' || !value || value.length > 512 || value.includes('/') || value === '.' || value === '..')
        throw new HttpsError('invalid-argument', 'Valid activity reference required');
    return value;
}
function integer(value, max = Number.MAX_SAFE_INTEGER) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max)
        throw review();
    return value;
}
function timestamp(value) {
    if (typeof value !== 'string')
        return NaN;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : NaN;
}
const live = (row) => !row.deleted_at && row.is_deleted !== true && row.is_draft !== true && row.draft !== true
    && (row.status == null || ['active', 'published', 'live', 'approved'].includes(String(row.status)));
const liveProfile = (row) => !row.deleted_at && row.is_deleted !== true;
function content(row) {
    if (['text', 'content', 'caption'].some(key => typeof row[key] === 'string' && row[key].trim().length > 0))
        return true;
    const media = [row.image_url, row.media_url, row.video_url, ...(Array.isArray(row.media_urls) ? row.media_urls : [])];
    return media.some(value => {
        if (typeof value !== 'string' || value.length > 8192)
            return false;
        try {
            const url = new URL(value);
            return ['https:', 'gs:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
        }
        catch {
            return false;
        }
    });
}
function ownsSource(row, actor, required) {
    const aliases = [actor.authUid, actor.profileId];
    return aliases.includes(String(row[required])) && ['author_id', 'user_id'].every(key => !Object.hasOwn(row, key) || aliases.includes(String(row[key])));
}
export async function assertTokenActor(tx, db, actor) {
    const [profile, index, profiles] = await Promise.all([
        tx.get(db.collection('profiles').doc(id(actor.profileId))), tx.get(db.collection('user_auth_index').doc(id(actor.authUid))),
        tx.get(db.collection('profiles').where('user_id', '==', actor.authUid).limit(2)),
    ]);
    if (!profile.exists || profile.data()?.user_id !== actor.authUid || !liveProfile(profile.data()) || profiles.size !== 1 || profiles.docs[0].id !== actor.profileId
        || (index.exists && index.data()?.profile_id !== actor.profileId))
        throw review();
}
/** Only the protected canonical grant is eligible. Invalid/legacy grants give no multiplier. */
export function validatedTokenBoostMultiplier(row, uid, type, nowMs) {
    if (!row || row.schema_version !== 1 || row.id !== tokenAuthorityId([uid, type]) || row.user_id !== uid || row.boost_type !== type
        || row.source_item_id !== (type === 'xp_2x' ? 'xp_boost_2x' : 'token_boost_2x') || row.consumed !== false || row.uses_remaining !== null)
        return 1;
    const start = timestamp(row.activated_at);
    const end = timestamp(row.expires_at);
    return Number.isFinite(nowMs) && start <= nowMs && nowMs < end && end > start && end - start <= 3_600_000 ? 2 : 1;
}
async function verifiedTarget(tx, db, postId, actor) {
    const target = (await tx.get(db.collection('posts').doc(id(postId)))).data();
    if (!target || !live(target) || !content(target))
        throw new HttpsError('failed-precondition', 'Comment target is unavailable');
    const owner = id(target.author_id);
    if ([actor.authUid, actor.profileId].includes(owner))
        throw new HttpsError('failed-precondition', 'Comments on your own posts are not eligible');
    const [direct, byUid] = await Promise.all([
        tx.get(db.collection('profiles').doc(owner)), tx.get(db.collection('profiles').where('user_id', '==', owner).limit(2)),
    ]);
    if (byUid.size > 1 || (direct.exists && byUid.size && direct.id !== byUid.docs[0].id))
        throw new HttpsError('failed-precondition', 'Comment target owner is ambiguous');
    const profile = direct.exists ? direct : byUid.docs[0];
    const data = profile?.data();
    if (!data || !liveProfile(data) || typeof data.user_id !== 'string' || !data.user_id || [actor.authUid, actor.profileId].includes(data.user_id)
        || (target.user_id != null && ![profile.id, data.user_id].includes(target.user_id)))
        throw new HttpsError('failed-precondition', 'Comment target owner is unavailable');
}
async function verifySource(tx, db, actor, type, referenceId, start, now) {
    if (type === 'daily_login')
        return;
    if (type === 'challenge_completed') {
        const source = await tx.get(db.collection('_challenge_reward_authority').doc(tokenAuthorityId([actor.authUid, referenceId])));
        const row = source.data();
        const claimed = timestamp(row?.claimed_at);
        if (!row || row.version !== 1 || row.auth_uid !== actor.authUid || row.profile_id !== actor.profileId || row.challenge_id !== referenceId
            || row.is_claimed !== true || row.legacy_claimed !== false || !Number.isFinite(claimed) || claimed < start || claimed > now
            || typeof row.xp_amount !== 'number' || !Number.isSafeInteger(row.xp_amount) || row.xp_amount < 0 || row.xp_amount > 100_000
            || typeof row.requirement_count !== 'number' || !Number.isSafeInteger(row.requirement_count) || row.requirement_count < 1 || row.requirement_count > 200) {
            throw new HttpsError('failed-precondition', 'A newly verified, claimed challenge is required');
        }
        return;
    }
    const collection = type === 'comment_added' ? 'comments' : 'posts';
    const snapshot = await tx.get(db.collection(collection).doc(referenceId));
    const row = snapshot.data();
    const created = snapshot.createTime?.toMillis();
    const ownerField = type === 'comment_added' && row && Object.hasOwn(row, 'user_id') ? 'user_id' : 'author_id';
    if (!row || !ownsSource(row, actor, ownerField))
        throw new HttpsError('permission-denied', 'Activity must belong to your account');
    if (!live(row) || !content(row) || created == null || !Number.isFinite(created) || created < start || created > now)
        throw new HttpsError('failed-precondition', 'A current, published activity is required');
    if (type === 'comment_added')
        await verifiedTarget(tx, db, row.post_id, actor);
}
/** Server rates and retained source proof only. No legacy balance, ad callback,
 * caller timestamp, amount, description, or DNA value can authorize credit. */
export async function claimTokenCredit(db, actor, input, nowMs = Date.now()) {
    id(actor.authUid);
    id(actor.profileId);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0)
        throw review();
    if (!input || !Object.hasOwn(rates, input.type))
        throw new HttpsError('failed-precondition', 'This token reward is not available without verified activity');
    const type = input.type;
    const rate = rates[type];
    const now = new Date(nowMs).toISOString();
    const today = now.slice(0, 10);
    const start = Date.parse(`${today}T00:00:00.000Z`);
    const referenceId = type === 'daily_login' ? today : id(input.referenceId);
    const key = tokenAuthorityId([actor.authUid, type, referenceId]);
    const receiptRef = db.collection('_token_credit_receipts').doc(key);
    const walletRef = db.collection('token_wallets').doc(actor.authUid);
    const quotaRef = db.collection('_token_credit_day_limits').doc(actor.authUid);
    const eventRef = db.collection('token_events').doc(key);
    return db.runTransaction(async (tx) => {
        await assertTokenActor(tx, db, actor);
        const [receiptSnap, walletSnap, quotaSnap, boostSnap, eventSnap] = await Promise.all([
            tx.get(receiptRef), tx.get(walletRef), tx.get(quotaRef),
            tx.get(db.collection('token_boosts').doc(tokenAuthorityId([actor.authUid, 'tokens_2x']))), tx.get(eventRef),
        ]);
        const wallet = walletSnap.data();
        if (wallet && (wallet.schema_version !== 1 || wallet.user_id !== actor.authUid || wallet.id !== actor.authUid || !Number.isFinite(timestamp(wallet.updated_at))))
            throw review();
        const balance = wallet ? integer(wallet.balance) : 0;
        const earned = wallet ? integer(wallet.lifetime_earned) : 0;
        const spent = wallet ? integer(wallet.lifetime_spent) : 0;
        if (earned - spent !== balance)
            throw review();
        const prior = receiptSnap.data();
        if (prior) {
            if (!wallet || prior.schema_version !== 1 || prior.user_id !== actor.authUid || prior.type !== type || prior.reference_id !== referenceId
                || prior.base_amount !== rate.amount || ![1, 2].includes(prior.multiplier) || prior.credited !== rate.amount * Number(prior.multiplier))
                throw review();
            return { success: true, balance, credited: 0, already_credited: true };
        }
        if (eventSnap.exists)
            throw review();
        await verifySource(tx, db, actor, type, referenceId, start, nowMs);
        const quota = quotaSnap.data();
        if (quota && (quota.schema_version !== 1 || quota.user_id !== actor.authUid || typeof quota.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quota.day) || quota.day > today))
            throw review();
        const counts = { daily_login: 0, comment_added: 0, post_created: 0, challenge_completed: 0 };
        if (quota?.day === today) {
            if (!quota.counts || typeof quota.counts !== 'object' || Array.isArray(quota.counts))
                throw review();
            for (const kind of Object.keys(rates))
                counts[kind] = integer(quota.counts[kind], rates[kind].cap);
        }
        if (counts[type] >= rate.cap)
            throw new HttpsError('resource-exhausted', 'Daily token reward limit reached. Try again tomorrow.', { retryAfter: Math.ceil((start + DAY - nowMs) / 1000) });
        const multiplier = validatedTokenBoostMultiplier(boostSnap.data(), actor.authUid, 'tokens_2x', nowMs);
        const credited = rate.amount * multiplier;
        const next = integer(balance + credited);
        const totalEarned = integer(earned + credited);
        counts[type]++;
        tx.set(walletRef, { id: actor.authUid, user_id: actor.authUid, schema_version: 1, balance: next, lifetime_earned: totalEarned, lifetime_spent: spent, updated_at: now });
        tx.set(quotaRef, { schema_version: 1, user_id: actor.authUid, day: today, counts, updated_at: now });
        tx.create(receiptRef, { schema_version: 1, user_id: actor.authUid, type, reference_id: referenceId, base_amount: rate.amount, multiplier, credited, created_at: now });
        tx.create(eventRef, { id: key, schema_version: 1, user_id: actor.authUid, amount: credited, transaction_type: type, description: rate.description, reference_id: referenceId, created_at: now });
        return { success: true, balance: next, credited, already_credited: false };
    });
}
//# sourceMappingURL=tokenCreditAuthority.js.map