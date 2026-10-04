import { createHash, randomUUID } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, auth, requireAuth, requireAdmin, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { premiumIdentity, unexpired, validPremiumGrant } from './_shared/premiumAuthority.js';

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', `Invalid ${label}`);
  return value;
}

function publicGrant(row: Record<string, any>, uid: string) {
  if (!validPremiumGrant(row, uid)) throw new HttpsError('failed-precondition', 'This gift needs verification. Contact support.');
  return { ...row, id: row.grant_id, is_expired: !unexpired(row.expires_at) };
}

export const premiumGiftManage = onCall(async request => {
  const uid = requireAuth(request);
  const data = request.data || {};
  const action = data.action;
  if (action === 'pending') {
    const row = (await db.collection('premium_grants').doc(uid).get()).data();
    if (!row || !validPremiumGrant(row, uid) || row.status !== 'pending' || row.revoked_at !== null || !unexpired(row.expires_at)) return { gift: null };
    const gifter = await premiumIdentity(row.gifted_by);
    const profile = gifter ? await db.collection('profiles').doc(gifter.profileId).get() : null;
    return { gift: { id: row.grant_id, user_id: uid, gifterUsername: profile?.data()?.username || 'VYBE', expires_at: row.expires_at } };
  }
  if (action === 'accept') {
    const grantId = identifier(data.grantId, 'gift');
    const ref = db.collection('premium_grants').doc(uid);
    return db.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (!validPremiumGrant(row, uid) || row.grant_id !== grantId) throw new HttpsError('not-found', 'This gift is no longer available.');
      if (row.status === 'revoked' || row.revoked_at !== null || !unexpired(row.expires_at)) throw new HttpsError('failed-precondition', 'This gift is no longer available.');
      if (row.status === 'accepted' && row.is_active === true) return { ok: true, gift: publicGrant(row, uid) };
      if (row.status !== 'pending' || row.is_active !== false) throw new HttpsError('failed-precondition', 'This gift needs verification.');
      const updated = { ...row, status: 'accepted', is_active: true, accepted_at: new Date().toISOString() };
      tx.update(ref, updated);
      return { ok: true, gift: publicGrant(updated, uid) };
    });
  }

  await requireAdmin(request);
  if (action === 'list') {
    if (data.userIds !== undefined) {
      if (!Array.isArray(data.userIds) || data.userIds.length > 20) throw new HttpsError('invalid-argument', 'Choose at most 20 accounts');
      const ids = [...new Set<string>(data.userIds.map((id: unknown) => identifier(id, 'account')))];
      const rows = await Promise.all(ids.map(id => db.collection('premium_grants').doc(id).get()));
      return { gifts: rows.filter(row => row.exists).map(row => publicGrant(row.data()!, row.id)) };
    }
    const rows = await db.collection('premium_grants').orderBy('created_at', 'desc').limit(20).get();
    return { gifts: rows.docs.map(row => publicGrant(row.data(), row.id)) };
  }
  if (action !== 'create' && action !== 'revoke') throw new HttpsError('invalid-argument', 'Unknown gift action');
  enforceRateLimit(await rateLimit(`premium-gift:${uid}`, 30, 60));
  const recipient = identifier(data.recipientUserId, 'recipient');
  const grantRef = db.collection('premium_grants').doc(recipient);
  if (action === 'revoke') {
    const grantId = identifier(data.grantId, 'gift');
    return db.runTransaction(async tx => {
      const row = (await tx.get(grantRef)).data();
      if (!validPremiumGrant(row, recipient) || row.grant_id !== grantId) throw new HttpsError('not-found', 'This gift has changed. Refresh and try again.');
      if (row.status === 'revoked') return { ok: true, gift: publicGrant(row, recipient) };
      const updated = { ...row, status: 'revoked', is_active: false, revoked_at: new Date().toISOString(), revoked_by: uid };
      tx.update(grantRef, updated);
      return { ok: true, gift: publicGrant(updated, recipient) };
    });
  }
  const requestId = identifier(data.requestId, 'request');
  const account = await auth.getUser(recipient).catch(() => null);
  if (!account || account.disabled) throw new HttpsError('not-found', 'This account cannot receive gifts.');
  const duration = data.durationDays;
  if (duration !== undefined && (!Number.isInteger(duration) || duration < 1 || duration > 365)) throw new HttpsError('invalid-argument', 'Gift duration must be 1 to 365 days');
  const fingerprint = JSON.stringify([recipient, duration ?? null]);
  const requestRef = db.collection('_premium_gift_requests').doc(createHash('sha256').update(`${uid}:${requestId}`).digest('hex'));
  const grantId = randomUUID();
  return db.runTransaction(async tx => {
    const [previous, existing] = await Promise.all([tx.get(requestRef), tx.get(grantRef)]);
    if (previous.exists) {
      if (previous.data()?.fingerprint !== fingerprint) throw new HttpsError('already-exists', 'This request was already used for a different gift.');
      const row = existing.data();
      if (!validPremiumGrant(row, recipient) || row.grant_id !== previous.data()?.grant_id) throw new HttpsError('failed-precondition', 'This gift has since changed. Refresh before gifting again.');
      return { ok: true, gift: publicGrant(row, recipient) };
    }
    const row = existing.data();
    const current = validPremiumGrant(row, recipient) && row.revoked_at === null && row.status !== 'revoked' && unexpired(row.expires_at);
    const now = new Date().toISOString();
    const gift = current ? row : {
      schema_version: 1, grant_id: grantId, user_id: recipient, gifted_by: uid,
      status: 'pending', is_active: false, created_at: now, accepted_at: null, revoked_at: null,
      expires_at: duration ? new Date(Date.now() + duration * 86400000).toISOString() : null,
    };
    if (!current) tx.set(grantRef, gift);
    tx.create(requestRef, { gifted_by: uid, fingerprint, grant_id: gift.grant_id, created_at: now });
    return { ok: true, gift: publicGrant(gift, recipient) };
  });
});
