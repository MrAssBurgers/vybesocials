import { createHash, randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const validRevision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const accountTime = (user) => Date.parse(user.metadata.creationTime);
const timestampVersion = (value) => value ? `${value.seconds}:${value.nanoseconds}` : null;
const profileVersion = (doc) => ({ createTime: timestampVersion(doc.createTime), updateTime: timestampVersion(doc.updateTime) });
const recovery = (code, available = false) => {
    throw new HttpsError('failed-precondition', available
        ? 'A reviewed profile recovery is available. Review and confirm it before continuing.'
        : 'Your existing profile needs an ownership review. Contact support for profile recovery; your data has not been changed.', { reason: 'profile-recovery-required', recoveryCode: code, recoveryAvailable: available });
};
function normalize(raw, uid) {
    if (!object(raw) || raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again.');
    if (!['ensure', 'syncIndex', 'recover'].includes(String(raw.action)) || !Number.isSafeInteger(raw.expectedAccountCreatedAt) || Number(raw.expectedAccountCreatedAt) <= 0
        || typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.requestId)
        || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedAccountCreatedAt', 'requestId', 'expectedProfileId', 'defaults'].includes(key))
        || (raw.expectedProfileId !== undefined && !id(raw.expectedProfileId)) || (raw.action === 'syncIndex' && !id(raw.expectedProfileId)))
        throw new HttpsError('invalid-argument', 'Invalid profile setup details.');
    if (raw.defaults !== undefined) {
        const d = raw.defaults;
        if (raw.action !== 'ensure' || !object(d) || Object.keys(d).some(key => !['username', 'displayName', 'avatarUrl', 'bio', 'onboardingCompleted'].includes(key))
            || (d.username !== undefined && (typeof d.username !== 'string' || !/^[a-z0-9_]{3,32}$/.test(d.username)))
            || (d.displayName !== undefined && (typeof d.displayName !== 'string' || d.displayName.length > 100))
            || (d.bio !== undefined && (typeof d.bio !== 'string' || d.bio.length > 2000))
            || (d.onboardingCompleted !== undefined && d.onboardingCompleted !== false)
            || (d.avatarUrl !== undefined && d.avatarUrl !== null && (typeof d.avatarUrl !== 'string' || d.avatarUrl.length > 8192 || !/^https:\/\//.test(d.avatarUrl))))
            throw new HttpsError('invalid-argument', 'Invalid initial profile details.');
    }
    return raw;
}
async function checkedUser(auth, uid, created) {
    let user;
    try {
        user = await auth.getUser(uid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found')
            throw new HttpsError('unauthenticated', 'This account is no longer available. Sign in again.');
        throw new HttpsError('unavailable', 'Account ownership could not be checked. Retry shortly.');
    }
    if (user.disabled)
        throw new HttpsError('permission-denied', 'This account is disabled. Contact support.');
    if (user.uid !== uid || !Number.isSafeInteger(accountTime(user)) || accountTime(user) !== created)
        recovery('account-incarnation-changed');
    return user;
}
async function requireAbsentOwner(auth, oldUid) {
    if (!oldUid)
        return;
    try {
        await auth.getUser(oldUid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found')
            return;
        throw new HttpsError('unavailable', 'The previous account could not be checked. Retry shortly.');
    }
    recovery('previous-account-active');
}
function approvedEvidence(row, user) {
    return !!row && row.version === 1 && row.status === 'approved' && row.target_uid === user.uid
        && row.auth_created_at_ms === accountTime(user) && user.emailVerified && !!user.email
        && row.verified_email_sha256 === sha256(user.email.trim().toLowerCase()) && id(row.profile_id)
        && (row.source_owner_uid === null || id(row.source_owner_uid)) && row.source_owner_uid !== user.uid
        && typeof row.source_create_time === 'string' && typeof row.source_update_time === 'string'
        && typeof row.reviewed_by === 'string' && row.reviewed_by.length > 0 && row.reviewed_by.length <= 128
        && typeof row.review_case === 'string' && row.review_case.length > 0 && row.review_case.length <= 200;
}
/** Read-only preparation. Output is not approval. Independent historical
 * ownership evidence must be reviewed before an operator approves this row. */
export async function prepareAccountProfileRecovery(database, auth, uid, profileId, reviewCase) {
    if (!id(uid) || !id(profileId) || !reviewCase || reviewCase.length > 200)
        throw new Error('Explicit UID, profile ID and review case are required.');
    const user = await auth.getUser(uid);
    if (user.disabled || !user.emailVerified || !user.email)
        throw new Error('Recovery requires a current verified Auth account.');
    const [profile, own, direct] = await Promise.all([database.doc(`profiles/${profileId}`).get(), database.collection('profiles').where('user_id', '==', uid).limit(2).get(), database.doc(`profiles/${uid}`).get()]);
    if (!profile.exists || !own.empty || direct.exists)
        throw new Error('Existing target identity or missing source needs manual review; nothing was changed.');
    const row = profile.data();
    const oldUid = row.user_id ?? null;
    if (oldUid !== null && !id(oldUid))
        throw new Error('Malformed previous identity needs manual repair.');
    await requireAbsentOwner(auth, oldUid);
    if (profileId !== oldUid)
        await requireAbsentOwner(auth, profileId);
    const versions = profileVersion(profile);
    return { version: 1, status: 'review-required', target_uid: uid, auth_created_at_ms: accountTime(user),
        verified_email_sha256: sha256(user.email.trim().toLowerCase()), profile_id: profileId, source_owner_uid: oldUid,
        source_create_time: versions.createTime, source_update_time: versions.updateTime, review_case: reviewCase, reviewed_by: null };
}
/** Canonical setup; no email/name authority and no placeholder deletion. */
export async function ensureAccountProfileForUid(database, auth, uid, raw, now = Date.now()) {
    const input = normalize(raw, uid), user = await checkedUser(auth, uid, input.expectedAccountCreatedAt);
    const fingerprint = sha256(JSON.stringify(canonical(input))), newRevision = randomBytes(24).toString('hex');
    return database.runTransaction(async (tx) => {
        const bindingRef = database.doc(`_account_profile_bindings/${uid}`), indexRef = database.doc(`user_auth_index/${uid}`);
        const evidenceRef = database.doc(`_account_profile_recovery/${uid}`), receiptRef = database.doc(`_account_profile_receipts/${sha256(`${uid}:${input.requestId}`)}`);
        const [bindingDoc, indexDoc, direct, owned, evidenceDoc, receiptDoc] = await Promise.all([
            tx.get(bindingRef), tx.get(indexRef), tx.get(database.doc(`profiles/${uid}`)), tx.get(database.collection('profiles').where('user_id', '==', uid).limit(3)), tx.get(evidenceRef), tx.get(receiptRef),
        ]);
        const binding = bindingDoc.data(), index = indexDoc.data(), evidence = evidenceDoc.data(), prior = receiptDoc.data();
        if (binding && (binding.version !== 1 || binding.owner_uid !== uid || binding.status !== 'active' || binding.auth_created_at_ms !== input.expectedAccountCreatedAt || !validRevision(binding.revision)))
            recovery('account-incarnation-changed');
        if (prior && (prior.owner_uid !== uid || prior.auth_created_at_ms !== input.expectedAccountCreatedAt || prior.fingerprint !== fingerprint))
            throw new HttpsError('already-exists', 'This profile retry belongs to different setup details.');
        if (owned.size > 1 || (direct.exists && (owned.empty || owned.docs[0].id !== direct.id)))
            recovery('identity-conflict');
        let selected = owned.docs[0], created = false, recovered = false;
        const available = approvedEvidence(evidence, user);
        if (selected && ((index && index.profile_id !== selected.id) || (binding && binding.profile_id !== selected.id)))
            recovery('identity-conflict');
        if (!selected && (binding || prior))
            recovery('identity-conflict');
        if (!selected && input.action === 'recover') {
            if (!available)
                recovery('recovery-not-approved');
            if (indexDoc.exists)
                recovery('identity-conflict');
            selected = await tx.get(database.doc(`profiles/${evidence.profile_id}`));
            const row = selected.data(), version = profileVersion(selected);
            if (!row || (row.user_id ?? null) !== evidence.source_owner_uid || version.createTime !== evidence.source_create_time || version.updateTime !== evidence.source_update_time
                || row.is_deleted === true || row.deleted_at)
                recovery('recovery-source-changed');
            recovered = true;
        }
        else if (!selected) {
            if (indexDoc.exists)
                recovery('identity-conflict');
            if (evidenceDoc.exists)
                recovery(available ? 'legacy-review-required' : 'recovery-not-approved', available);
            // Public email is only a duplication warning; NEVER claim authority.
            if (user.email) {
                const candidates = await tx.get(database.collection('profiles').where('email', '==', user.email.trim().toLowerCase()).limit(1));
                if (!candidates.empty)
                    recovery('legacy-review-required');
            }
            if (input.action !== 'ensure')
                recovery('identity-conflict');
            selected = direct;
            created = true;
        }
        const profileId = selected.id;
        if (input.expectedProfileId !== undefined && input.expectedProfileId !== profileId)
            recovery('identity-conflict');
        const [aliases, foreignIndices] = await Promise.all([
            profileId === uid ? Promise.resolve(null) : tx.get(database.collection('profiles').where('user_id', '==', profileId).limit(2)),
            tx.get(database.collection('user_auth_index').where('profile_id', '==', profileId).limit(3)),
        ]);
        const previousUid = recovered ? evidence.source_owner_uid : null;
        if (aliases && !aliases.empty && !(recovered && previousUid === profileId && aliases.size === 1 && aliases.docs[0].id === profileId))
            recovery('identity-conflict');
        // Both historical forms are accepted by old data/role paths. Retire each
        // alias, never just the source user_id while leaving profileId reusable.
        const retiredAliases = recovered ? [...new Set([previousUid, profileId].filter((value) => !!value && value !== uid))] : [];
        if (foreignIndices.docs.some(doc => doc.id !== uid && !retiredAliases.includes(doc.id)))
            recovery('identity-conflict');
        const oldAliases = await Promise.all(retiredAliases.map(async (alias) => {
            const bindingRef = database.doc(`_account_profile_bindings/${alias}`), indexRef = database.doc(`user_auth_index/${alias}`);
            const [binding, index] = await Promise.all([tx.get(bindingRef), tx.get(indexRef)]);
            if ((binding.exists && binding.data()?.profile_id !== profileId) || (index.exists && index.data()?.profile_id !== profileId))
                recovery('identity-conflict');
            await requireAbsentOwner(auth, alias);
            return { alias, bindingRef, indexRef, binding: binding.data(), indexExists: index.exists };
        }));
        if (previousUid) {
            const previousProfiles = await tx.get(database.collection('profiles').where('user_id', '==', previousUid).limit(2));
            if (previousProfiles.size !== 1 || previousProfiles.docs[0].id !== profileId)
                recovery('identity-conflict');
        }
        let row = selected.data();
        if (!created && (!row || row.is_deleted === true || row.deleted_at || (!recovered && row.user_id !== uid)))
            recovery('identity-conflict');
        const bindingRevision = binding?.revision || newRevision;
        if (prior && (prior.profile_id !== profileId || prior.binding_revision !== bindingRevision || !binding))
            recovery('identity-conflict');
        if (created) {
            const d = input.defaults || {}, username = d.username || `user_${sha256(uid).slice(0, 16)}`;
            const duplicate = await tx.get(database.collection('profiles').where('username', '==', username).limit(1));
            if (!duplicate.empty)
                throw new HttpsError('already-exists', 'That username is already in use. Choose another username.');
            row = { id: uid, user_id: uid, username, display_name: d.displayName ?? d.username ?? null, avatar_url: d.avatarUrl ?? null,
                bio: d.bio ?? '', onboarding_completed: false, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() };
        }
        // Auth and Firestore cannot commit atomically. Recheck immediately before
        // writes; durable incarnation evidence rejects later setup by a reused UID.
        const finalUser = await checkedUser(auth, uid, input.expectedAccountCreatedAt);
        if (recovered && (!approvedEvidence(evidence, finalUser) || finalUser.email !== user.email))
            recovery('account-incarnation-changed');
        for (const alias of retiredAliases)
            await requireAbsentOwner(auth, alias);
        if (created)
            tx.create(selected.ref, row);
        if (recovered) {
            row = { ...row, user_id: uid, updated_at: new Date(now).toISOString() };
            tx.update(selected.ref, { user_id: uid, updated_at: row.updated_at });
            tx.update(evidenceRef, { status: 'consumed', consumed_by: uid, consumed_at_ms: now, binding_revision: bindingRevision });
            for (const old of oldAliases) {
                if (old.indexExists)
                    tx.delete(old.indexRef);
                tx.set(old.bindingRef, { ...(old.binding || {}), version: 1, owner_uid: old.alias, profile_id: profileId, status: 'retired', revision: newRevision, retired_at_ms: now, transferred_to_uid: uid });
            }
        }
        if (!binding)
            tx.create(bindingRef, { version: 1, owner_uid: uid, profile_id: profileId, auth_created_at_ms: input.expectedAccountCreatedAt,
                status: 'active', revision: bindingRevision, source: recovered ? 'reviewed-recovery' : created ? 'new-account' : 'existing-owned-profile', created_at_ms: now });
        tx.set(indexRef, { profile_id: profileId, owner_uid: uid, auth_created_at_ms: input.expectedAccountCreatedAt, binding_revision: bindingRevision,
            username: typeof row.username === 'string' ? row.username : null, email: finalUser.email || null, updated_at: new Date(now).toISOString() });
        if (!prior)
            tx.create(receiptRef, { owner_uid: uid, auth_created_at_ms: input.expectedAccountCreatedAt, fingerprint, profile_id: profileId, binding_revision: bindingRevision, created, recovered, created_at_ms: now });
        return { ok: true, ownerUid: uid, accountCreatedAt: input.expectedAccountCreatedAt, requestId: input.requestId, action: input.action,
            status: 'ready', profileId, profile: { ...row, id: profileId, user_id: uid }, bindingRevision, created: prior ? prior.created === true : created, recovered: prior ? prior.recovered === true : recovered };
    });
}
//# sourceMappingURL=accountProfileAuthority.js.map