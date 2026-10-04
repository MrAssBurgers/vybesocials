import { randomUUID, randomBytes } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { resolveIdentity } from './_shared/profileAudienceAuthority.js';
import { admitSharedTheme, sharedThemeDto, themeActor, themeHash, themeId, themeRelationship, themeRequestId } from './_shared/sharedThemeAuthority.js';
import { normalizeSharedThemeLayout, normalizeSharedThemeTokens, THEME_VISIBILITIES, themeRecord, themeText } from './_shared/sharedThemeSchema.js';
const OPTIONS = { region: 'us-central1', cpu: 0.083, concurrency: 1, maxInstances: 20 };
function inputRow(raw, uid, allowed) {
    let input;
    try {
        input = themeRecord(raw);
    }
    catch {
        throw new HttpsError('invalid-argument', 'Theme details are required.');
    }
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen themes.');
    if (Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', ...allowed].includes(key)))
        throw new HttpsError('invalid-argument', 'Unsupported theme details.');
    themeId(input.expectedProfileId);
    return input;
}
function checkReceipt(row, hash, uid, profileId) {
    if (row && (row.version !== 1 || row.payload_hash !== hash || row.owner_uid !== uid || row.profile_id !== profileId))
        throw new HttpsError('already-exists', 'This request was already used for different theme details.');
}
const receiptData = (hash, uid, profileId, extra) => ({ version: 1, payload_hash: hash, owner_uid: uid, profile_id: profileId, ...extra });
const referenceId = (uid, id) => themeHash(uid, id);
async function references(db, tx, collection, verifiedAliases, id) {
    const rows = await tx.get(db.collection(collection).where('user_id', 'in', verifiedAliases).where('shared_theme_id', '==', id).limit(101));
    if (rows.size > 100)
        throw new HttpsError('failed-precondition', 'Your theme references need cleanup.');
    return rows;
}
export async function runManageSharedTheme(database, uid, raw) {
    const input = inputRow(raw, uid, ['action', 'requestId', 'themeId', 'themeIds', 'themeName', 'themeTokens', 'layoutSettings', 'description', 'tags', 'category', 'visibility', 'recipientProfileIds']);
    const profileId = themeId(input.expectedProfileId);
    const action = input.action;
    if (!['create', 'read', 'readMany', 'save', 'unsave', 'like', 'unlike'].includes(action))
        throw new HttpsError('invalid-argument', 'Unsupported theme action.');
    const actionKeys = action === 'create' ? ['requestId', 'themeName', 'themeTokens', 'layoutSettings', 'description', 'tags', 'category', 'visibility', 'recipientProfileIds']
        : action === 'read' ? ['themeId'] : action === 'readMany' ? ['themeIds'] : ['requestId', 'themeId'];
    if (Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', ...actionKeys].includes(key)))
        throw new HttpsError('invalid-argument', 'Unsupported details for this theme action.');
    if (action === 'readMany') {
        if (!Array.isArray(input.themeIds) || input.themeIds.length < 1 || input.themeIds.length > 20)
            throw new HttpsError('invalid-argument', 'Select between one and twenty themes.');
        const ids = input.themeIds.map(themeId);
        if (new Set(ids).size !== ids.length)
            throw new HttpsError('invalid-argument', 'Theme selections must be unique.');
        return database.runTransaction(async (tx) => {
            const actor = await themeActor(database, tx, uid, profileId);
            const themes = [];
            for (const id of ids) {
                try {
                    const admitted = await admitSharedTheme(database, tx, actor, id);
                    // This bulk reader admits Browse candidates only. A once-public row
                    // must disappear after becoming private, even for its own creator.
                    if (admitted.visibility === 'public')
                        themes.push(admitted.theme);
                }
                catch (error) {
                    // Candidate rows never supply content or access. A malformed stored
                    // theme or failed service read must remain a visible retryable error.
                    if (!(error instanceof HttpsError) || !['not-found', 'permission-denied'].includes(error.code))
                        throw error;
                }
            }
            return { themes, ownerUid: uid, profileId };
        });
    }
    if (action === 'read') {
        const id = themeId(input.themeId);
        return database.runTransaction(async (tx) => {
            const actor = await themeActor(database, tx, uid, profileId);
            try {
                const admitted = await admitSharedTheme(database, tx, actor, id);
                return { theme: admitted.theme, ownerUid: uid, profileId };
            }
            catch (error) {
                // A checked empty receipt distinguishes revoked/deleted content from a
                // missing callable or transport failure, which must still show Retry.
                if (error instanceof HttpsError && ['not-found', 'permission-denied'].includes(error.code))
                    return { theme: null, ownerUid: uid, profileId };
                throw error;
            }
        });
    }
    const requestId = themeRequestId(input.requestId);
    const requestRef = database.doc(`_shared_theme_receipts/${themeHash(uid, requestId)}`);
    if (action === 'create') {
        let source;
        let recipientIds;
        let visibility;
        try {
            if (!THEME_VISIBILITIES.includes(input.visibility))
                throw new Error('Invalid visibility');
            visibility = input.visibility;
            if (input.recipientProfileIds !== undefined && !Array.isArray(input.recipientProfileIds))
                throw new Error('Invalid recipients');
            recipientIds = [...new Set((input.recipientProfileIds || []).map(themeId))].sort();
            if (recipientIds.length > 30 || (visibility === 'friends' ? recipientIds.length === 0 : recipientIds.length !== 0))
                throw new Error('Choose up to 30 friends only for friend shares');
            if (input.tags != null && (!Array.isArray(input.tags) || input.tags.length > 10))
                throw new Error('Invalid tags');
            source = {
                theme_name: themeText(input.themeName, 80, true), theme_tokens: normalizeSharedThemeTokens(input.themeTokens),
                layout_settings: normalizeSharedThemeLayout(input.layoutSettings), description: themeText(input.description, 1000) || null,
                tags: input.tags == null ? null : [...new Set(input.tags.map(tag => themeText(tag, 40, true)))], category: themeText(input.category, 40) || null,
            };
        }
        catch {
            throw new HttpsError('invalid-argument', 'Invalid theme settings or recipients.');
        }
        const hash = themeHash(action, profileId, source, visibility, recipientIds);
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        return database.runTransaction(async (tx) => {
            const actor = await themeActor(database, tx, uid, profileId);
            const receipt = await tx.get(requestRef);
            checkReceipt(receipt.data(), hash, uid, profileId);
            if (receipt.exists) {
                const admitted = await admitSharedTheme(database, tx, actor, themeId(receipt.data().theme_id));
                if (admitted.owner.uid !== uid || admitted.visibility !== visibility)
                    throw new HttpsError('permission-denied', 'The original theme is no longer available.');
                return { theme: admitted.theme, visibility, recipientProfileIds: recipientIds, requestId, ownerUid: uid, profileId };
            }
            const recipients = [];
            for (const recipientId of recipientIds) {
                const recipient = await resolveIdentity(database, tx, recipientId);
                if (!recipient || recipient.profileId !== recipientId || recipient.uid === uid)
                    throw new HttpsError('permission-denied', 'A selected friend is unavailable.');
                const relationship = await themeRelationship(database, tx, actor, recipient);
                if (!relationship.friends || relationship.blocked)
                    throw new HttpsError('permission-denied', 'A selected person is no longer an available friend.');
                recipients.push({ uid: recipient.uid, profileId: recipient.profileId });
            }
            const row = { ...source, schema_version: 2, creator_id: profileId, visibility, is_public: visibility === 'public', created_at: createdAt, likes_count: 0, downloads_count: visibility === 'private' ? 1 : 0 };
            tx.create(database.doc(`shared_themes/${id}`), row);
            tx.create(database.doc(`_shared_theme_authority/${id}`), { version: 1, theme_id: id, owner_uid: uid, owner_profile_id: profileId, visibility, recipients });
            if (visibility === 'private')
                tx.create(database.doc(`saved_themes/${referenceId(uid, id)}`), { user_id: profileId, owner_uid: uid, shared_theme_id: id, created_at: createdAt });
            tx.create(requestRef, receiptData(hash, uid, profileId, { theme_id: id }));
            return { theme: sharedThemeDto(id, row, actor.row), visibility, recipientProfileIds: recipientIds, requestId, ownerUid: uid, profileId };
        });
    }
    const id = themeId(input.themeId);
    const hash = themeHash(action, profileId, id);
    return database.runTransaction(async (tx) => {
        const actor = await themeActor(database, tx, uid, profileId);
        const adding = action === 'save' || action === 'like';
        let admitted = null;
        try {
            admitted = await admitSharedTheme(database, tx, actor, id);
        }
        catch (error) {
            // An unavailable theme must not trap the account's own saved/liked reference.
            if (adding || !(error instanceof HttpsError) || !['not-found', 'permission-denied', 'failed-precondition'].includes(error.code))
                throw error;
        }
        const receipt = await tx.get(requestRef);
        checkReceipt(receipt.data(), hash, uid, profileId);
        const result = { themeId: id, action, requestId, ownerUid: uid, profileId };
        if (receipt.exists)
            return result;
        const collection = action === 'save' || action === 'unsave' ? 'saved_themes' : 'theme_likes';
        const existing = await references(database, tx, collection, actor.aliases, id);
        const ref = database.doc(`${collection}/${referenceId(uid, id)}`);
        // Reference presence, not a claimed count or bookmark, determines the transition.
        if (adding && existing.empty) {
            tx.create(ref, { user_id: profileId, owner_uid: uid, shared_theme_id: id, created_at: new Date().toISOString() });
            const field = action === 'like' ? 'likes_count' : 'downloads_count';
            tx.update(database.doc(`shared_themes/${id}`), { [field]: admitted.theme[field] + 1 });
        }
        else if (!adding && !existing.empty) {
            existing.docs.forEach(doc => tx.delete(doc.ref));
            if (action === 'unlike' && admitted)
                tx.update(database.doc(`shared_themes/${id}`), { likes_count: Math.max(0, admitted.theme.likes_count - 1) });
        }
        tx.create(requestRef, receiptData(hash, uid, profileId, { theme_id: id, action }));
        return result;
    });
}
function codeInput(raw, uid, operation) {
    const input = inputRow(raw, uid, ['requestId', operation === 'generate' ? 'themeId' : 'code']);
    const requestId = themeRequestId(input.requestId);
    const profileId = themeId(input.expectedProfileId);
    const target = operation === 'generate' ? themeId(input.themeId) : typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
    if (operation === 'use' && !/^[A-Z0-9]{8}$/.test(target))
        throw new HttpsError('invalid-argument', 'Enter the eight-character theme code.');
    return { requestId, profileId, target };
}
function validCodeMapping(row) {
    return row.version === 1 && Number.isSafeInteger(row.max_uses) && row.max_uses >= 1 && row.max_uses <= 100
        && Number.isSafeInteger(row.uses_count) && row.uses_count >= 0 && row.uses_count <= row.max_uses
        && typeof row.expires_at === 'string' && Number.isFinite(Date.parse(row.expires_at));
}
export async function runGenerateThemeCode(database, uid, raw) {
    const { requestId, profileId, target: id } = codeInput(raw, uid, 'generate');
    const requestRef = database.doc(`_theme_code_receipts/${themeHash('generate', uid, requestId)}`);
    const hash = themeHash(profileId, id);
    // A random, protected lookup is not a grant to private/friend-only contents.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from(randomBytes(8), byte => alphabet[byte & 31]).join('');
    return database.runTransaction(async (tx) => {
        const actor = await themeActor(database, tx, uid, profileId);
        const admitted = await admitSharedTheme(database, tx, actor, id);
        if (admitted.owner.uid !== uid || !['public', 'unlisted'].includes(admitted.visibility))
            throw new HttpsError('permission-denied', 'Only your public or unlisted themes can have import codes.');
        const receipt = await tx.get(requestRef);
        checkReceipt(receipt.data(), hash, uid, profileId);
        const resultCode = receipt.exists ? receipt.data().code : code;
        const mappingRef = database.doc(`_theme_codes/${resultCode}`);
        const mapping = await tx.get(mappingRef);
        if (receipt.exists) {
            const row = mapping.data();
            if (!row || !validCodeMapping(row) || row.theme_id !== id || row.owner_uid !== uid || Date.parse(row.expires_at) <= Date.now())
                throw new HttpsError('failed-precondition', 'This code expired or is unavailable. Generate a new code.');
            return { code: resultCode, themeId: id, expiresAt: row.expires_at, requestId, ownerUid: uid, profileId };
        }
        if (mapping.exists)
            throw new HttpsError('aborted', 'Please retry generating this code.');
        const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
        tx.create(mappingRef, { version: 1, theme_id: id, owner_uid: uid, expires_at: expiresAt, max_uses: 100, uses_count: 0 });
        tx.create(requestRef, receiptData(hash, uid, profileId, { code }));
        return { code, themeId: id, expiresAt, requestId, ownerUid: uid, profileId };
    });
}
export async function runUseThemeCode(database, uid, raw) {
    const { requestId, profileId, target: code } = codeInput(raw, uid, 'use');
    const hash = themeHash(profileId, code);
    const requestRef = database.doc(`_theme_code_receipts/${themeHash('use', uid, requestId)}`);
    return database.runTransaction(async (tx) => {
        const actor = await themeActor(database, tx, uid, profileId);
        const [receipt, mapping] = await Promise.all([tx.get(requestRef), tx.get(database.doc(`_theme_codes/${code}`))]);
        checkReceipt(receipt.data(), hash, uid, profileId);
        const row = mapping.data();
        if (!row)
            throw new HttpsError('not-found', 'This theme code was not found.');
        if (!validCodeMapping(row))
            throw new HttpsError('failed-precondition', 'This theme code is unavailable.');
        if (Date.parse(row.expires_at) <= Date.now())
            throw new HttpsError('failed-precondition', 'This theme code expired.');
        const admitted = await admitSharedTheme(database, tx, actor, themeId(row.theme_id));
        if (admitted.owner.uid !== row.owner_uid || !['public', 'unlisted'].includes(admitted.visibility))
            throw new HttpsError('permission-denied', 'This theme is no longer available through a code.');
        if (receipt.exists && (receipt.data().theme_id !== admitted.theme.id || receipt.data().code !== code))
            throw new HttpsError('failed-precondition', 'The original code result is no longer available.');
        if (!receipt.exists) {
            if (row.uses_count >= row.max_uses)
                throw new HttpsError('resource-exhausted', 'This theme code has reached its use limit.');
            tx.update(mapping.ref, { uses_count: row.uses_count + 1 });
            tx.create(requestRef, receiptData(hash, uid, profileId, { code, theme_id: admitted.theme.id }));
        }
        return { theme: admitted.theme, code, themeId: admitted.theme.id, requestId, ownerUid: uid, profileId };
    });
}
export const manageSharedTheme = onCall(OPTIONS, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`theme-manage:${uid}`, 90, 60));
    if (request.data?.action === 'readMany')
        enforceRateLimit(await rateLimit(`theme-bulk:${uid}`, 20, 60));
    return runManageSharedTheme(db, uid, request.data);
});
export const generateThemeCode = onCall(OPTIONS, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`theme-code-generate:${uid}`, 20, 60));
    return runGenerateThemeCode(db, uid, request.data);
});
export const useThemeCode = onCall(OPTIONS, async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`theme-code-use:${uid}`, 30, 60));
    return runUseThemeCode(db, uid, request.data);
});
//# sourceMappingURL=sharedThemes.js.map