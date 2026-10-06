import { HttpsError } from 'firebase-functions/v2/https';
import { validAudienceId } from './profileAudienceAuthority.js';
/** One read attempt only: no cross-request cache of account incarnation or status. */
export async function checkedSpaceAuthBatch(auth, rawUids) {
    const uids = [...new Set(rawUids)];
    if (!auth.getUsers || !uids.length)
        return auth;
    if (uids.length > 200 || uids.some(uid => !validAudienceId(uid)))
        throw new HttpsError('failed-precondition', 'Room accounts could not be checked.');
    const users = new Map(), absent = new Set();
    const chunks = [];
    for (let offset = 0; offset < uids.length; offset += 100)
        chunks.push(uids.slice(offset, offset + 100));
    try {
        await Promise.all(chunks.map(async (ids) => {
            const requested = new Set(ids), result = await auth.getUsers(ids.map(uid => ({ uid })));
            const seen = new Set();
            for (const user of result.users) {
                if (!requested.has(user.uid) || seen.has(user.uid))
                    throw new Error('Invalid account response');
                seen.add(user.uid);
                users.set(user.uid, user);
            }
            for (const missing of result.notFound) {
                if (!('uid' in missing) || !requested.has(missing.uid) || seen.has(missing.uid))
                    throw new Error('Invalid account response');
                seen.add(missing.uid);
                absent.add(missing.uid);
            }
            if (seen.size !== requested.size)
                throw new Error('Incomplete account response');
        }));
    }
    catch {
        throw new HttpsError('unavailable', 'Account verification is unavailable. Please retry.');
    }
    return { getUser: async (uid) => {
            const user = users.get(uid);
            if (user)
                return user;
            if (absent.has(uid))
                throw Object.assign(new Error('Account no longer exists'), { code: 'auth/user-not-found' });
            return auth.getUser(uid);
        } };
}
//# sourceMappingURL=spaceAuthBatch.js.map