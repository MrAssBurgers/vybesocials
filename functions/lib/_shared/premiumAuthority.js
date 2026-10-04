import { db, requireAuth, requireAdmin } from './admin.js';
export function unexpired(value, now = Date.now()) {
    if (value === null)
        return true; // Explicit lifetime grant.
    let expiry;
    if (typeof value === 'string')
        expiry = Date.parse(value);
    else if (typeof value === 'number')
        expiry = value;
    else if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function')
        expiry = value.toMillis();
    else
        return false;
    return Number.isFinite(expiry) && expiry > now;
}
export function validPremiumGrant(data, uid) {
    if (!data || typeof data !== 'object')
        return false;
    const row = data;
    const date = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    return row.schema_version === 1 && row.user_id === uid && typeof row.grant_id === 'string' && row.grant_id.length > 0
        && typeof row.gifted_by === 'string' && row.gifted_by.length > 0 && date(row.created_at)
        && (row.expires_at === null || date(row.expires_at))
        && (row.status === 'pending' ? row.is_active === false && row.accepted_at === null && row.revoked_at === null
            : row.status === 'accepted' ? row.is_active === true && date(row.accepted_at) && row.revoked_at === null
                : row.status === 'revoked' && row.is_active === false && date(row.revoked_at) && (row.accepted_at === null || date(row.accepted_at)));
}
export function isActivePremiumGrant(data, uid, now = Date.now()) {
    return validPremiumGrant(data, uid) && data.status === 'accepted' && data.is_active === true
        && typeof data.accepted_at === 'string' && data.revoked_at === null && unexpired(data.expires_at, now);
}
export async function premiumIdentity(uidOrProfile) {
    const direct = await db.collection('profiles').doc(uidOrProfile).get();
    if (direct.exists && typeof direct.data()?.user_id === 'string')
        return { uid: direct.data().user_id, profileId: direct.id };
    const profiles = await db.collection('profiles').where('user_id', '==', uidOrProfile).limit(2).get();
    if (profiles.docs.length !== 1)
        return null;
    return { uid: uidOrProfile, profileId: profiles.docs[0].id };
}
export async function hasOwnerRole(uid, profileId) {
    const ids = [...new Set([uid, profileId].filter((id) => !!id))];
    const rows = await Promise.all(['user_roles', 'user_roles_auth'].flatMap(name => ids.map(id => db.collection(name)
        .where('user_id', '==', id).where('role', '==', 'owner').get())));
    return rows.some(result => result.docs.some(doc => !Object.hasOwn(doc.data(), 'enabled') || doc.data().enabled === true));
}
/** Only the new, historically client-inaccessible grant namespace can authorize benefits. */
export async function premiumStatusForUid(uid, includeOwner = true) {
    const [grant, subscription, identity] = await Promise.all([
        db.collection('premium_grants').doc(uid).get(),
        db.collection('subscriptions').doc(uid).get(),
        includeOwner ? premiumIdentity(uid) : Promise.resolve(null),
    ]);
    const row = grant.data();
    const giftActive = isActivePremiumGrant(row, uid);
    const sub = subscription.data();
    const subscriptionActive = sub?.status === 'active' && unexpired(sub.expires_at);
    const isOwner = includeOwner && await hasOwnerRole(uid, identity?.profileId);
    return {
        active: giftActive || subscriptionActive,
        gift_active: giftActive,
        is_owner: isOwner,
        source: giftActive ? 'gift' : subscriptionActive ? String(sub?.source || 'subscription') : null,
        expires_at: giftActive ? row.expires_at : subscriptionActive && sub.expires_at !== null
            ? new Date(typeof sub.expires_at === 'string' ? Date.parse(sub.expires_at) : typeof sub.expires_at === 'number' ? sub.expires_at : sub.expires_at.toMillis()).toISOString() : null,
    };
}
/** Cosmetic owner preview and permission to issue gifts are separate capabilities. */
export async function premiumStatusForRequest(request) {
    const uid = requireAuth(request);
    let canManageGifts = false;
    try {
        await requireAdmin(request);
        canManageGifts = true;
    }
    catch (error) {
        if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'permission-denied')
            throw error;
    }
    return { ...await premiumStatusForUid(uid), can_manage_gifts: canManageGifts };
}
//# sourceMappingURL=premiumAuthority.js.map