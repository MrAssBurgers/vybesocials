import { db } from './admin.js';
export function friendshipPairId(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}
export async function areFriends(profileA, profileB) {
    const outbound = `${profileA}_${profileB}`;
    const inbound = `${profileB}_${profileA}`;
    const [outSnap, inSnap] = await Promise.all([
        db.collection('friend_requests').doc(outbound).get(),
        db.collection('friend_requests').doc(inbound).get(),
    ]);
    const out = outSnap.data();
    const inn = inSnap.data();
    return out?.status === 'accepted' || inn?.status === 'accepted';
}
export async function isBlocked(a, b) {
    const [ab, ba] = await Promise.all([
        db.collection('blocked_users').where('blocker_id', '==', a).where('blocked_id', '==', b).limit(1).get(),
        db.collection('blocked_users').where('blocker_id', '==', b).where('blocked_id', '==', a).limit(1).get(),
    ]);
    return !ab.empty || !ba.empty;
}
export async function resolveProfileId(authUid) {
    const snap = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
    return snap.docs[0]?.id || authUid;
}
export function expiresAtForDuration(duration, customMinutes) {
    const now = Date.now();
    switch (duration) {
        case 'once':
            return new Date(now + 15 * 60 * 1000).toISOString();
        case '1h':
            return new Date(now + 60 * 60 * 1000).toISOString();
        case 'until_tonight': {
            const d = new Date();
            d.setUTCHours(23, 59, 59, 999);
            if (d.getTime() <= now)
                d.setUTCDate(d.getUTCDate() + 1);
            return d.toISOString();
        }
        case '24h':
            return new Date(now + 24 * 60 * 60 * 1000).toISOString();
        case 'while_using':
            return new Date(now + 4 * 60 * 60 * 1000).toISOString();
        case 'custom':
            return new Date(now + Math.max(5, customMinutes ?? 60) * 60 * 1000).toISOString();
        case 'indefinite':
        default:
            return new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();
    }
}
//# sourceMappingURL=friendship.js.map