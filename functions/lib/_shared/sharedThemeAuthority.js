import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity } from './profileAudienceAuthority.js';
import { normalizeSharedThemeTokens, normalizeSharedThemeLayout, THEME_VISIBILITIES, themeText, themeHttpsUrl } from './sharedThemeSchema.js';
export const themeHash = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function themeId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
        throw new HttpsError('invalid-argument', 'Invalid theme identity');
    return value;
}
export function themeRequestId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
        throw new HttpsError('invalid-argument', 'A stable theme request identity is required');
    return value.toLowerCase();
}
export async function themeActor(db, tx, uid, expectedProfileId) {
    const actor = await resolveIdentity(db, tx, uid);
    if (!actor || actor.uid !== uid || actor.profileId !== expectedProfileId)
        throw new HttpsError('failed-precondition', 'Your profile changed. Reopen themes and retry.');
    return actor;
}
export async function themeRelationship(db, tx, a, b) {
    const [outgoing, incoming, aBlock, bBlock] = await Promise.all([
        tx.get(db.collection('friend_requests').where('sender_id', 'in', a.aliases).where('receiver_id', 'in', b.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('friend_requests').where('sender_id', 'in', b.aliases).where('receiver_id', 'in', a.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', a.aliases).where('blocked_id', 'in', b.aliases).limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', b.aliases).where('blocked_id', 'in', a.aliases).limit(1)),
    ]);
    return { blocked: !aBlock.empty || !bBlock.empty, friends: !outgoing.empty || !incoming.empty };
}
/** Reuse only reads from one transaction and one already-verified viewer. */
export function themeAdmissionCache() {
    return { owners: new Map(), relationships: new Map() };
}
function creatorSummary(row) {
    const text = (value, max) => {
        try {
            return typeof value === 'string' ? themeText(value.slice(0, max), max) || null : null;
        }
        catch {
            return null;
        }
    };
    let avatar = null;
    try {
        avatar = row.avatar_url ? themeHttpsUrl(row.avatar_url) || null : null;
    }
    catch { /* Do not return unsafe or malformed media. */ }
    return { username: text(row.username, 80), display_name: text(row.display_name, 120), avatar_url: avatar };
}
export function sharedThemeDto(id, row, creator) {
    try {
        const count = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
        const created = row.created_at == null || row.created_at === '' ? null : typeof row.created_at === 'string' ? new Date(row.created_at) : new Date(NaN);
        if (created && !Number.isFinite(created.getTime()))
            throw new Error('Invalid date');
        return {
            id, creator_id: themeId(row.creator_id), theme_name: themeText(row.theme_name, 80, true),
            theme_tokens: normalizeSharedThemeTokens(row.theme_tokens), layout_settings: normalizeSharedThemeLayout(row.layout_settings),
            description: themeText(row.description, 1000) || null, tags: Array.isArray(row.tags) ? row.tags.slice(0, 10).map(tag => themeText(tag, 40, true)) : null,
            category: themeText(row.category, 40) || null, is_public: row.is_public === true,
            likes_count: count(row.likes_count), downloads_count: count(row.downloads_count), created_at: created?.toISOString() || '',
            ...(creator ? { creator: creatorSummary(creator) } : {}),
        };
    }
    catch {
        throw new HttpsError('failed-precondition', 'This theme contains unsupported settings.');
    }
}
export async function admitSharedTheme(db, tx, viewer, id, cache = themeAdmissionCache()) {
    const [snapshot, authority] = await Promise.all([tx.get(db.doc(`shared_themes/${id}`)), tx.get(db.doc(`_shared_theme_authority/${id}`))]);
    const row = snapshot.data();
    const proof = authority.data();
    if (!row || row.deleted_at || row.is_deleted === true)
        throw new HttpsError('not-found', 'This theme is unavailable.');
    const ownerId = themeId(row.creator_id);
    if (!cache.owners.has(ownerId))
        cache.owners.set(ownerId, resolveIdentity(db, tx, ownerId));
    const owner = await cache.owners.get(ownerId);
    if (!owner || !owner.aliases.includes(row.creator_id))
        throw new HttpsError('failed-precondition', 'Theme ownership cannot be verified.');
    let visibility = row.is_public === true ? 'public' : 'private';
    let recipients = [];
    if (proof) {
        if (proof.version !== 1 || proof.theme_id !== id || proof.owner_uid !== owner.uid || proof.owner_profile_id !== owner.profileId
            || !THEME_VISIBILITIES.includes(proof.visibility) || row.visibility !== proof.visibility || row.is_public !== (proof.visibility === 'public')
            || !Array.isArray(proof.recipients) || proof.recipients.length > 30
            || proof.recipients.some(value => !value || typeof value.uid !== 'string' || typeof value.profileId !== 'string')) {
            throw new HttpsError('failed-precondition', 'Theme access settings need review.');
        }
        visibility = proof.visibility;
        recipients = proof.recipients;
    }
    else if (row.schema_version === 2 || row.visibility === 'friends' || row.visibility === 'unlisted') {
        throw new HttpsError('permission-denied', 'This theme has no verified sharing permission.');
    }
    if (viewer.uid !== owner.uid) {
        if (visibility === 'private')
            throw new HttpsError('permission-denied', 'This theme is private.');
        if (!cache.relationships.has(owner.uid))
            cache.relationships.set(owner.uid, themeRelationship(db, tx, viewer, owner));
        const relationship = await cache.relationships.get(owner.uid);
        if (relationship.blocked || (visibility === 'friends' && (!relationship.friends || !recipients.some(item => item.uid === viewer.uid && item.profileId === viewer.profileId)))) {
            throw new HttpsError('permission-denied', 'This theme is no longer shared with you.');
        }
    }
    return { theme: sharedThemeDto(id, { ...row, creator_id: owner.profileId }, owner.row), row, owner, visibility, recipients };
}
/** DM delivery is a fresh grant check, never a way to expand a theme's audience. */
export async function assertSharedThemeDelivery(db, tx, senderUid, senderProfileId, recipientProfileId, id) {
    const sender = await themeActor(db, tx, senderUid, senderProfileId);
    const recipient = await resolveIdentity(db, tx, recipientProfileId);
    if (!recipient || recipient.profileId !== recipientProfileId || recipient.uid === sender.uid)
        throw new HttpsError('permission-denied', 'Theme recipient is unavailable.');
    const admitted = await admitSharedTheme(db, tx, recipient, themeId(id));
    if (admitted.owner.uid !== sender.uid || admitted.visibility !== 'friends'
        || !admitted.recipients.some(item => item.uid === recipient.uid && item.profileId === recipient.profileId)) {
        throw new HttpsError('permission-denied', 'This recipient has no theme delivery grant.');
    }
}
//# sourceMappingURL=sharedThemeAuthority.js.map