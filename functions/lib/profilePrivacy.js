import { FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { db, requireAdmin, requireAuth } from './_shared/admin.js';
import { resolveProfileId } from './_shared/friendship.js';
const PROFILE_PRIVATE = 'profile_private';
const PUBLIC_PROFILE_FIELDS = [
    'id',
    'username',
    'display_name',
    'avatar_url',
    'interests',
    'created_at',
];
function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function calculateAge(dob, today = new Date()) {
    const raw = asString(dob);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const birth = new Date(year, month - 1, day);
    if (birth.getFullYear() !== year ||
        birth.getMonth() !== month - 1 ||
        birth.getDate() !== day ||
        birth > today) {
        return null;
    }
    let age = today.getFullYear() - birth.getFullYear();
    const monthDelta = today.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate()))
        age -= 1;
    return age;
}
function ageWindow(age) {
    if (age === null)
        return null;
    if (age < 13)
        return { min: Math.max(0, age - 2), max: age + 2 };
    if (age < 18)
        return { min: Math.max(13, age - 2), max: Math.min(17, age + 2) };
    if (age < 25)
        return { min: Math.max(18, age - 4), max: age + 4 };
    return { min: Math.max(18, age - 7), max: age + 7 };
}
async function privateDateOfBirth(profileId, publicProfile) {
    const privateSnap = await db.collection(PROFILE_PRIVATE).doc(profileId).get();
    const privateDob = asString(privateSnap.data()?.date_of_birth);
    if (privateDob)
        return privateDob;
    const publicDob = asString(publicProfile?.date_of_birth);
    return publicDob || null;
}
function publicProfile(row) {
    const data = row.data() || {};
    const username = asString(data.username);
    if (!username)
        return null;
    const out = { id: row.id };
    for (const field of PUBLIC_PROFILE_FIELDS) {
        if (field === 'id')
            continue;
        out[field] = data[field] ?? null;
    }
    return out;
}
async function moveDateOfBirthToPrivate(profileId, profile) {
    const dob = asString(profile.date_of_birth);
    if (!dob)
        return false;
    await db.collection(PROFILE_PRIVATE).doc(profileId).set({
        profile_id: profileId,
        user_id: asString(profile.user_id) || null,
        date_of_birth: dob,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    await db.collection('profiles').doc(profileId).update({
        date_of_birth: FieldValue.delete(),
        updated_at: new Date().toISOString(),
    });
    return true;
}
/** Keep newly written profile DOB out of globally readable profile documents. */
export const onProfilePrivacyWritten = onDocumentWritten({ document: 'profiles/{profileId}', region: 'us-central1' }, async (event) => {
    const after = event.data?.after;
    if (!after?.exists)
        return;
    await moveDateOfBirthToPrivate(event.params.profileId, after.data() || {});
});
/**
 * Admin-only, idempotent backfill for existing profiles. It copies DOB to the
 * owner-only document before removing the public field.
 */
export const scrubProfileDateOfBirth = onCall({ region: 'us-central1' }, async (request) => {
    await requireAdmin(request);
    const requestedLimit = Number(request.data?.limit ?? 100);
    const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 100));
    const snap = await db
        .collection('profiles')
        .where('date_of_birth', '!=', null)
        .limit(limit)
        .get();
    let scrubbed = 0;
    for (const doc of snap.docs) {
        if (await moveDateOfBirthToPrivate(doc.id, doc.data() || {}))
            scrubbed += 1;
    }
    return { ok: true, scanned: snap.size, scrubbed };
});
/** Server-side discovery can age-filter suggestions without returning DOB. */
export const getDiscoveryProfiles = onCall({ region: 'us-central1' }, async (request) => {
    const authUid = requireAuth(request);
    const profileId = await resolveProfileId(authUid);
    const viewerSnap = await db.collection('profiles').doc(profileId).get();
    if (!viewerSnap.exists)
        throw new HttpsError('failed-precondition', 'Profile not found');
    const viewerDob = await privateDateOfBirth(profileId, viewerSnap.data() || {});
    const ageRange = ageWindow(calculateAge(viewerDob));
    const payload = (request.data || {});
    const requestedLimit = Number(payload.limit ?? 120);
    const limit = Math.max(20, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 120));
    const candidateIds = Array.isArray(payload.candidateIds)
        ? [...new Set(payload.candidateIds.map(asString).filter(Boolean))].slice(0, limit)
        : [];
    const docs = candidateIds.length
        ? await Promise.all(candidateIds.map((id) => db.collection('profiles').doc(id).get()))
        : (await db
            .collection('profiles')
            .orderBy('created_at', 'desc')
            .limit(limit)
            .get()).docs;
    const profiles = [];
    for (const doc of docs) {
        if (!doc.exists || doc.id === profileId)
            continue;
        const data = doc.data() || {};
        if (ageRange) {
            const dob = await privateDateOfBirth(doc.id, data);
            const age = calculateAge(dob);
            if (age !== null && (age < ageRange.min || age > ageRange.max))
                continue;
        }
        const sanitized = publicProfile(doc);
        if (sanitized)
            profiles.push(sanitized);
        if (profiles.length >= 30)
            break;
    }
    return { profiles };
});
//# sourceMappingURL=profilePrivacy.js.map