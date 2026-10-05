import { createHash, randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { isActivePremiumGrant, unexpired } from './premiumAuthority.js';
const DAY = 86400000, MAX_COUNT = 1000000;
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= MAX_COUNT;
const validRevision = (v) => typeof v === 'string' && /^[a-f0-9]{48}$/.test(v);
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const revision = () => randomBytes(24).toString('hex');
const stale = () => new HttpsError('aborted', 'Your streak changed. Refresh it before trying again.');
const invalid = () => new HttpsError('invalid-argument', 'Invalid login streak details.');
const emptyLegacy = (status = 'none') => ({ status, currentStreak: null, longestStreak: null, lastLoginDate: null });
const noEvent = () => ({ isNewDay: false, streakExtended: false, streakBroken: false, restored: false });
const validEvent = (value) => object(value)
    && ['isNewDay', 'streakExtended', 'streakBroken', 'restored'].every(key => typeof value[key] === 'boolean')
    && Object.keys(value).length === 4;
// Matches the existing usePremiumStatus launch policy: functional perks are
// temporarily free. This is server policy, never a caller-supplied entitlement.
export const LOGIN_STREAK_RESTORE_LAUNCH_FREE = true;
export function loginStreakRestoreAccess(uid, grant, subscription, now, launchFree = LOGIN_STREAK_RESTORE_LAUNCH_FREE) {
    if (launchFree)
        return 'launch-free';
    const sub = object(subscription) ? subscription : null;
    return isActivePremiumGrant(grant, uid, now) || (sub?.status === 'active' && (sub.user_id === undefined || sub.user_id === uid) && unexpired(sub.expires_at, now)) ? 'premium' : 'none';
}
export function canonicalStreakTimezone(value) {
    if (typeof value !== 'string' || !value || value.length > 100)
        throw invalid();
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
    }
    catch {
        throw invalid();
    }
}
export function streakLocalDay(now, timezone) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = (name) => parts.find(value => value.type === name).value;
    return Date.parse(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`) / DAY;
}
const dateLabel = (day) => new Date(day * DAY).toISOString().slice(0, 10);
/** Find the first instant of a civil date, including 23/25-hour DST days. */
export function streakDayStartsAt(day, timezone) {
    let low = (day - 2) * DAY, high = (day + 2) * DAY;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (streakLocalDay(mid, timezone) < day)
            low = mid + 1;
        else
            high = mid;
    }
    return low;
}
function normalize(raw, uid) {
    if (!object(raw) || raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen your streak.');
    const action = raw.action;
    if (!['read', 'track', 'restore'].includes(String(action)) || !validAudienceId(raw.expectedProfileId) || !Number.isSafeInteger(raw.expectedAccountCreatedAt) || Number(raw.expectedAccountCreatedAt) <= 0
        || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', 'timezone', ...(action === 'read' ? [] : ['requestId']), ...(action === 'restore' ? ['expectedRevision'] : [])].includes(key))
        || (action !== 'read' && !uuid(raw.requestId)) || (action === 'restore' && !validRevision(raw.expectedRevision)))
        throw invalid();
    return { action: action, expectedOwnerUid: uid, expectedProfileId: raw.expectedProfileId, expectedAccountCreatedAt: Number(raw.expectedAccountCreatedAt), timezone: canonicalStreakTimezone(raw.timezone),
        ...(action === 'read' ? {} : { requestId: raw.requestId }), ...(action === 'restore' ? { expectedRevision: raw.expectedRevision } : {}) };
}
async function checkAuth(auth, input) {
    let user;
    try {
        user = await auth.getUser(input.expectedOwnerUid);
    }
    catch (error) {
        throw new HttpsError(error?.code === 'auth/user-not-found' ? 'unauthenticated' : 'unavailable', 'Your account could not be verified. Sign in again or retry.');
    }
    if (user.disabled || user.uid !== input.expectedOwnerUid || Date.parse(user.metadata.creationTime) !== input.expectedAccountCreatedAt)
        throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before viewing your streak.');
}
async function readLegacy(db, tx, actor, today) {
    const [direct, byOwner, byProfile] = await Promise.all([
        tx.getAll(...actor.aliases.map(alias => db.collection('login_streaks').doc(alias))),
        tx.get(db.collection('login_streaks').where('user_id', 'in', actor.aliases).limit(3)),
        tx.get(db.collection('login_streaks').where('profile_id', '==', actor.profileId).limit(3)),
    ]);
    const docs = new Map([...direct, ...byOwner.docs, ...byProfile.docs].filter(doc => doc.exists).map(doc => [doc.id, doc.data()]));
    if (!docs.size)
        return emptyLegacy();
    if (docs.size > 1)
        return emptyLegacy('ambiguous');
    const row = [...docs.values()][0];
    if (!actor.aliases.includes(row.user_id) || (row.profile_id !== undefined && row.profile_id !== actor.profileId)
        || !count(row.current_streak) || !count(row.longest_streak) || row.longest_streak < row.current_streak
        || typeof row.last_login_date !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(row.last_login_date))
        return emptyLegacy('invalid');
    const day = Date.parse(`${row.last_login_date}T00:00:00Z`) / DAY;
    if (!Number.isInteger(day) || day < 0 || day > today || dateLabel(day) !== row.last_login_date)
        return emptyLegacy('invalid');
    return { status: 'preserved', currentStreak: row.current_streak, longestStreak: row.longest_streak, lastLoginDate: row.last_login_date };
}
function checkedState(row, input, bindingRevision) {
    if (!row)
        return undefined;
    const legacy = row.legacy, previous = row.previous;
    const validLegacy = object(legacy) && ['none', 'preserved', 'ambiguous', 'invalid'].includes(String(legacy.status))
        && (legacy.currentStreak === null || count(legacy.currentStreak)) && (legacy.longestStreak === null || count(legacy.longestStreak))
        && (legacy.lastLoginDate === null || (typeof legacy.lastLoginDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(legacy.lastLoginDate)));
    const validPrevious = previous === null || (object(previous) && count(previous.count) && typeof previous.verified === 'boolean'
        && Number.isInteger(previous.lastDay) && Number.isInteger(previous.brokenDay) && Number.isInteger(previous.gap)
        && Number(previous.gap) >= 2 && Number(previous.brokenDay) - Number(previous.lastDay) === previous.gap);
    if (row.version !== 1 || row.owner_uid !== input.expectedOwnerUid || row.profile_id !== input.expectedProfileId || row.account_created_at_ms !== input.expectedAccountCreatedAt
        || row.binding_revision !== bindingRevision || !validRevision(row.revision) || typeof row.timezone !== 'string' || canonicalStreakTimezone(row.timezone) !== row.timezone
        || !count(row.current) || row.current < 1 || !count(row.longest) || row.longest < row.current || typeof row.verified !== 'boolean'
        || !Number.isInteger(row.last_day) || Number(row.last_day) < 0 || !validPrevious || !validLegacy || !Number.isSafeInteger(row.updated_at_ms)) {
        throw new HttpsError('failed-precondition', 'Your streak history needs review. It has not been reset.');
    }
    return row;
}
function breakCandidate(state, today) {
    const gap = today - state.last_day;
    return gap >= 2 ? { count: state.current, verified: state.verified, lastDay: state.last_day, brokenDay: today, gap } : state.previous;
}
function restoreInfo(state, today, access) {
    const previous = state ? breakCandidate(state, today) : null;
    const until = previous ? streakDayStartsAt(previous.brokenDay + 1, state.timezone) : null;
    const reason = !previous ? 'no-break' : !previous.verified ? 'legacy-unverified' : previous.gap !== 2 ? 'missed-multiple-days'
        : previous.brokenDay !== today ? 'expired' : access === 'none' ? 'premium-required' : 'available';
    return { eligible: reason === 'available', previousStreak: previous?.verified && previous.gap === 2 && previous.brokenDay === today ? previous.count : null,
        availableUntil: until === null ? null : new Date(until).toISOString(), access, reason };
}
function projection(state, legacy, input, now, access, event, replayed) {
    const timezone = state?.timezone || input.timezone, today = streakLocalDay(now, timezone);
    const legacyDay = legacy.lastLoginDate ? Date.parse(`${legacy.lastLoginDate}T00:00:00Z`) / DAY : null;
    const current = state ? (today - state.last_day <= 1 ? state.current : 0) : legacyDay !== null && today - legacyDay <= 1 ? legacy.currentStreak || 0 : 0;
    const lastDay = state?.last_day ?? legacyDay;
    return { ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, accountCreatedAt: input.expectedAccountCreatedAt,
        action: input.action, requestId: input.requestId || null, serverTime: now, revision: state?.revision || null, timezone, timezoneChanged: timezone !== input.timezone,
        currentDay: dateLabel(today), streak: current, longestStreak: state?.longest ?? legacy.longestStreak ?? 0, currentStreakVerified: state?.verified ?? current === 0,
        needsLoginToday: !state || state.last_day !== today, expiresAt: lastDay === null ? null : new Date(streakDayStartsAt(lastDay + 2, timezone)).toISOString(),
        ...event, streakBroken: event.streakBroken || (!!state && (today - state.last_day >= 2 || state.previous?.brokenDay === today)), replayed,
        legacyHistory: legacy, restore: restoreInfo(state, today, access) };
}
export async function manageLoginStreakForUid(db, auth, uid, raw, now = Date.now()) {
    const input = normalize(raw, uid);
    await checkAuth(auth, input);
    const fingerprint = hash(input);
    return db.runTransaction(async (tx) => {
        const stateRef = db.collection('_login_streak_state').doc(uid);
        const receiptRef = input.requestId ? db.collection('_login_streak_receipts').doc(hash([uid, input.requestId])) : null;
        const [actor, bindingDoc, stateDoc, receiptDoc, gift, subscription] = await Promise.all([
            resolveIdentity(db, tx, uid), tx.get(db.collection('_account_profile_bindings').doc(uid)), tx.get(stateRef), receiptRef ? tx.get(receiptRef) : null,
            tx.get(db.collection('premium_grants').doc(uid)), tx.get(db.collection('subscriptions').doc(uid)),
        ]);
        const binding = bindingDoc.data();
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId || binding?.version !== 1 || binding.status !== 'active' || binding.owner_uid !== uid
            || binding.profile_id !== actor.profileId || binding.auth_created_at_ms !== input.expectedAccountCreatedAt || !validRevision(binding.revision)) {
            throw new HttpsError('failed-precondition', 'Load your verified account profile before viewing your streak.');
        }
        let state = checkedState(stateDoc.data(), input, binding.revision);
        const timezone = state?.timezone || input.timezone, today = streakLocalDay(now, timezone);
        if (state && today < state.last_day)
            throw new HttpsError('unavailable', 'The streak calendar could not be confirmed. Retry shortly.');
        const legacy = state?.legacy || await readLegacy(db, tx, actor, today);
        const access = loginStreakRestoreAccess(uid, gift.data(), subscription.data(), now);
        const prior = receiptDoc?.data();
        if (prior) {
            if (prior.owner_uid !== uid || prior.profile_id !== actor.profileId || prior.account_created_at_ms !== input.expectedAccountCreatedAt || prior.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This streak retry belongs to different details.');
            if (prior.version !== 1 || !state || prior.resulting_revision !== state.revision || prior.day !== today || !validEvent(prior.event))
                throw stale();
            await checkAuth(auth, input);
            return projection(state, legacy, input, now, access, prior.event, true);
        }
        let event = noEvent(), changed = false;
        if (input.action === 'restore') {
            if (!state || input.expectedRevision !== state.revision)
                throw stale();
            const info = restoreInfo(state, today, access);
            if (!info.eligible || info.previousStreak === null)
                throw new HttpsError('failed-precondition', info.reason === 'legacy-unverified'
                    ? 'Older streak history is preserved for display, but cannot verify a restore.' : info.reason === 'premium-required'
                    ? 'An active verified Pro entitlement is required to restore this streak.' : 'Only one missed day can be restored, before the end of your current streak-calendar day.');
            state = { ...state, current: Math.min(MAX_COUNT, info.previousStreak + 1), longest: Math.max(state.longest, Math.min(MAX_COUNT, info.previousStreak + 1)),
                verified: true, last_day: today, previous: null, revision: revision(), updated_at_ms: now };
            changed = true;
            event = { isNewDay: false, streakExtended: false, streakBroken: false, restored: true };
        }
        else if (input.action === 'track' && (!state || state.last_day !== today)) {
            if (!state) {
                const legacyDay = legacy.lastLoginDate ? Date.parse(`${legacy.lastLoginDate}T00:00:00Z`) / DAY : null;
                const previousCount = legacy.currentStreak || 0, gap = legacyDay === null ? null : today - legacyDay;
                const continuing = previousCount > 0 && gap !== null && gap <= 1;
                const current = continuing ? Math.min(MAX_COUNT, previousCount + (gap === 1 ? 1 : 0)) : 1;
                const previous = previousCount > 0 && gap !== null && gap >= 2 ? { count: previousCount, verified: false, lastDay: legacyDay, brokenDay: today, gap } : null;
                state = { version: 1, owner_uid: uid, profile_id: actor.profileId, account_created_at_ms: input.expectedAccountCreatedAt, binding_revision: binding.revision,
                    revision: revision(), timezone, current, verified: !continuing, longest: Math.max(legacy.longestStreak || 0, current), last_day: today, previous, legacy, updated_at_ms: now };
                event = { isNewDay: !(continuing && gap === 0), streakExtended: !previous && !(continuing && gap === 0), streakBroken: !!previous, restored: false };
            }
            else {
                const previous = breakCandidate(state, today), gap = today - state.last_day;
                const current = gap === 1 ? Math.min(MAX_COUNT, state.current + 1) : 1;
                state = { ...state, current, verified: gap === 1 ? state.verified : true, longest: Math.max(state.longest, current), last_day: today,
                    previous: gap === 1 ? null : previous, revision: revision(), updated_at_ms: now };
                event = { isNewDay: true, streakExtended: gap === 1, streakBroken: gap >= 2, restored: false };
            }
            changed = true;
        }
        await checkAuth(auth, input);
        if (changed)
            tx.set(stateRef, state);
        if (receiptRef)
            tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: actor.profileId, account_created_at_ms: input.expectedAccountCreatedAt,
                fingerprint, resulting_revision: state.revision, day: today, event, created_at_ms: now });
        return projection(state, legacy, input, now, access, event, false);
    });
}
//# sourceMappingURL=loginStreakAuthority.js.map