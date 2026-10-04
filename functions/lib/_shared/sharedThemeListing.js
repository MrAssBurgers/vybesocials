import { randomBytes } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { admitSharedTheme, themeActor, themeAdmissionCache, themeId } from './sharedThemeAuthority.js';
import { themeText } from './sharedThemeSchema.js';
const PAGE_SIZE = 50;
const referenceId = (value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1500 && !value.includes('/') && value !== '.' && value !== '..';
async function resumeCursor(db, tx, value, identity) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'string' || !/^[a-f0-9]{48}$/.test(value))
        throw new HttpsError('invalid-argument', 'Invalid theme page.');
    const row = (await tx.get(db.collection('_shared_theme_cursors').doc(value))).data();
    if (!row || Object.keys(row).some(key => !['version', 'uid', 'profileId', 'scope', 'search', 'id', 'rank', 'expireAt'].includes(key))
        || row.version !== 1 || row.uid !== identity.uid || row.profileId !== identity.profileId || row.scope !== identity.scope || row.search !== identity.search || !referenceId(row.id)
        || !(row.expireAt instanceof Timestamp) || row.expireAt.toMillis() <= Date.now()
        || (identity.scope === 'public' && (!Number.isSafeInteger(row.rank) || row.rank < 0)) || (identity.scope === 'saved' && row.rank !== undefined)) {
        throw new HttpsError('failed-precondition', 'This theme page expired or no longer matches your request. Refresh themes.');
    }
    return row;
}
// The position stays private because a skipped/blocked candidate can be last.
// A cursor is navigation, never a grant; resumed rows are freshly admitted.
function issueCursor(db, tx, identity, id, rank) {
    const token = randomBytes(24).toString('hex');
    tx.create(db.collection('_shared_theme_cursors').doc(token), { version: 1, ...identity, id, ...(rank === undefined ? {} : { rank }), expireAt: Timestamp.fromMillis(Date.now() + 10 * 60_000) });
    return token;
}
const unavailable = (error) => error instanceof HttpsError && ['not-found', 'permission-denied'].includes(error.code);
export async function listPublicThemes(db, uid, profileId, rawSearch, rawCursor) {
    let search;
    try {
        search = themeText(rawSearch, 80).toLocaleLowerCase('en-US');
    }
    catch {
        throw new HttpsError('invalid-argument', 'Use up to eighty characters to search themes.');
    }
    const identity = { uid, profileId, scope: 'public', search };
    return db.runTransaction(async (tx) => {
        const actor = await themeActor(db, tx, uid, profileId);
        const cursor = await resumeCursor(db, tx, rawCursor, identity);
        let query = db.collection('shared_themes').where('is_public', '==', true).orderBy('likes_count', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(PAGE_SIZE + 1);
        if (cursor)
            query = query.startAfter(cursor.rank, cursor.id);
        const rows = await tx.get(query);
        const candidates = rows.docs.slice(0, PAGE_SIZE);
        const themes = [];
        const cache = themeAdmissionCache();
        for (const candidate of candidates) {
            try {
                const admitted = await admitSharedTheme(db, tx, actor, candidate.id, cache);
                if (admitted.visibility === 'public' && (!search || admitted.theme.theme_name.toLocaleLowerCase('en-US').includes(search)))
                    themes.push(admitted.theme);
            }
            catch (error) {
                if (!unavailable(error))
                    throw error;
            }
        }
        let nextCursor = null;
        if (rows.size > PAGE_SIZE) {
            const last = candidates.at(-1);
            const rank = last.data().likes_count;
            if (!Number.isSafeInteger(rank) || rank < 0)
                throw new HttpsError('failed-precondition', 'Theme ordering needs review.');
            nextCursor = issueCursor(db, tx, identity, last.id, rank);
        }
        return { themes, nextCursor, ownerUid: uid, profileId };
    });
}
export async function listSavedThemeReferences(db, uid, profileId, rawCursor) {
    const identity = { uid, profileId, scope: 'saved', search: '' };
    return db.runTransaction(async (tx) => {
        const actor = await themeActor(db, tx, uid, profileId);
        const cursor = await resumeCursor(db, tx, rawCursor, identity);
        let query = db.collection('saved_themes').where('user_id', 'in', actor.aliases).orderBy(FieldPath.documentId()).limit(PAGE_SIZE + 1);
        if (cursor)
            query = query.startAfter(cursor.id);
        const rows = await tx.get(query);
        const candidates = rows.docs.slice(0, PAGE_SIZE);
        const references = [];
        const cache = themeAdmissionCache();
        for (const reference of candidates) {
            const row = reference.data();
            let id = null;
            try {
                id = themeId(row.shared_theme_id);
            }
            catch { /* A malformed owned bookmark is unavailable, never authority. */ }
            let theme = null;
            if (id) {
                try {
                    theme = (await admitSharedTheme(db, tx, actor, id, cache)).theme;
                }
                catch (error) {
                    if (!unavailable(error))
                        throw error;
                }
            }
            references.push({ savedId: reference.id, themeId: id, createdAt: typeof row.created_at === 'string' ? row.created_at.slice(0, 100) : '', theme });
        }
        return { references, nextCursor: rows.size > PAGE_SIZE ? issueCursor(db, tx, identity, candidates.at(-1).id) : null, ownerUid: uid, profileId };
    });
}
//# sourceMappingURL=sharedThemeListing.js.map