import { auth, db } from './admin.js';
const FOUNDER_EMAIL = 'barron.bakic@gmail.com';
const FOUNDER_USERNAMES = new Set(['mrassburgers', 'bakrix']);
function isPlaceholderUsername(username) {
    if (typeof username !== 'string')
        return true;
    const u = username.trim().toLowerCase();
    return !u || u.startsWith('user_');
}
/**
 * Links the signed-in Firebase Auth user to an existing Firestore profile by email
 * (Google/Apple OAuth creates a new uid — migrated DMs/posts live on profiles.id).
 */
export async function claimProfileByEmailForUid(authUid) {
    const userRecord = await auth.getUser(authUid);
    const email = userRecord.email?.trim().toLowerCase() || '';
    if (!email)
        return { profileId: null, claimed: false };
    const indexSnap = await db.collection('user_auth_index').doc(authUid).get();
    if (indexSnap.exists) {
        const profileId = String(indexSnap.data()?.profile_id || '');
        if (profileId) {
            const profSnap = await db.collection('profiles').doc(profileId).get();
            if (profSnap.exists) {
                const prof = profSnap.data();
                if (prof.user_id !== authUid || (email && prof.email !== email)) {
                    await db.collection('profiles').doc(profileId).set({
                        user_id: authUid,
                        ...(email ? { email } : {}),
                        updated_at: new Date().toISOString(),
                    }, { merge: true });
                }
                await writeAuthIndex(authUid, profileId, prof, email || String(prof.email || ''));
            }
            return { profileId, claimed: false };
        }
    }
    const byUserId = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
    if (!byUserId.empty) {
        const profileId = byUserId.docs[0].id;
        await writeAuthIndex(authUid, profileId, byUserId.docs[0].data(), email);
        return { profileId, claimed: false };
    }
    let profileDoc = (await db.collection('profiles').where('email', '==', email).limit(5).get()).docs[0];
    if (!profileDoc && email === FOUNDER_EMAIL) {
        for (const username of FOUNDER_USERNAMES) {
            const snap = await db.collection('profiles').where('username', '==', username).limit(1).get();
            if (!snap.empty) {
                profileDoc = snap.docs[0];
                break;
            }
        }
    }
    if (!profileDoc)
        return { profileId: null, claimed: false };
    const profileId = profileDoc.id;
    const profileData = profileDoc.data();
    const existingAuthUid = profileData.user_id;
    if (existingAuthUid && existingAuthUid !== authUid && existingAuthUid !== profileId) {
        try {
            await auth.getUser(existingAuthUid);
            return { profileId: null, claimed: false };
        }
        catch {
            /* stale / deleted auth user — safe to reclaim */
        }
    }
    await db.collection('profiles').doc(profileId).set({
        user_id: authUid,
        email,
        updated_at: new Date().toISOString(),
    }, { merge: true });
    await writeAuthIndex(authUid, profileId, profileData, email);
    const orphan = await db.collection('profiles').doc(authUid).get();
    if (orphan.exists && orphan.id !== profileId && isPlaceholderUsername(orphan.data()?.username)) {
        await db.collection('profiles').doc(authUid).delete();
    }
    return { profileId, claimed: true };
}
async function writeAuthIndex(authUid, profileId, profileData, email) {
    await db.collection('user_auth_index').doc(authUid).set({
        profile_id: profileId,
        username: profileData.username || null,
        email,
        updated_at: new Date().toISOString(),
    });
}
//# sourceMappingURL=claimProfileByEmail.js.map