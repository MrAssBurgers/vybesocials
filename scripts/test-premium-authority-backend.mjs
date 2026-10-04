import assert from 'node:assert/strict';
assert.ok(/^demo-/.test(process.env.GCLOUD_PROJECT || ''), 'Demo project required');
assert.ok(/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''), 'Loopback emulator required');
const { premiumGiftManage } = await import('../functions/lib/premiumGifts.js');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { premiumStatusForRequest } = await import('../functions/lib/_shared/premiumAuthority.js');
// Only provider account lookup is replaced; all Firestore reads, transactions,
// conflicts/retries, role checks, rate limits and callables below are real.
const originalLookup = auth.getUser;
auth.getUser = async uid => { assert.ok(['premium-qa-alice', 'premium-qa-bob'].includes(uid), 'Synthetic recipients only'); return { uid, disabled: false }; };
const call = (uid, data, admin = false) => premiumGiftManage.run({ auth: uid ? { uid, token: { admin } } : undefined, data });
const create = (requestId, extra = {}) => call('premium-qa-staff', { action: 'create', recipientUserId: 'premium-qa-alice', requestId, ...extra }, true);
let checks = 0;
const pass = label => { checks++; console.log(`PASS ${label}`); };
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok, 'Emulator reset succeeded');
  await db.doc('profiles/premium-qa-staff').set({ user_id: 'premium-qa-staff', username: 'Synthetic team' });
  await assert.rejects(call(null, { action: 'pending' }), { code: 'unauthenticated' });
  await assert.rejects(call('premium-qa-alice', { action: 'create', recipientUserId: 'premium-qa-alice', requestId: 'unauthorized' }), { code: 'permission-denied' }); pass('real role checks reject unauthenticated/nonstaff requests');
  const [first, second] = await Promise.all([create('create-one'), create('create-two')]);
  assert.equal(first.gift.id, second.gift.id); assert.equal(first.gift.status, 'pending'); pass('simultaneous creation yields one grant');
  const replay = await create('create-one'); assert.equal(replay.gift.id, first.gift.id); pass('lost acknowledgment replay retains original gift');
  await assert.rejects(create('create-one', { recipientUserId: 'premium-qa-bob' }), { code: 'already-exists' }); pass('reused request cannot retarget a recipient');
  await assert.rejects(call('premium-qa-bob', { action: 'accept', grantId: first.gift.id, recipientUserId: 'premium-qa-alice' }), { code: 'not-found' }); pass('other recipient cannot accept gift');
  const accepts = await Promise.all(Array.from({ length: 3 }, () => call('premium-qa-alice', { action: 'accept', grantId: first.gift.id })));
  assert.equal(new Set(accepts.map(r => r.gift.accepted_at)).size, 1); assert.ok(accepts.every(r => r.gift.is_active)); pass('simultaneous acceptance retains one acceptance time');
  await Promise.allSettled([call('premium-qa-alice', { action: 'accept', grantId: first.gift.id }), call('premium-qa-staff', { action: 'revoke', recipientUserId: 'premium-qa-alice', grantId: first.gift.id }, true)]);
  assert.equal((await db.doc('premium_grants/premium-qa-alice').get()).data().status, 'revoked'); pass('accept/revoke race ends revoked');
  assert.equal((await create('create-one')).gift.status, 'revoked'); pass('replayed create never revives revoked grant');
  const replacement = await create('create-three'); assert.notEqual(replacement.gift.id, first.gift.id);
  await assert.rejects(call('premium-qa-alice', { action: 'accept', grantId: first.gift.id }), { code: 'not-found' });
  await assert.rejects(call('premium-qa-staff', { action: 'revoke', recipientUserId: 'premium-qa-alice', grantId: first.gift.id }, true), { code: 'not-found' }); pass('replacement resists stale acceptance and revocation');
  await assert.rejects(create('create-one'), { code: 'failed-precondition' }); pass('superseded create replay cannot change replacement');
  const pending = await call('premium-qa-alice', { action: 'pending' }); assert.equal(pending.gift.id, replacement.gift.id); assert.equal(pending.gift.gifterUsername, 'Synthetic team'); pass('pending view resolves authenticated recipient and issuer');
  await db.doc('user_roles/premium-qa-role').set({ user_id: 'premium-qa-role', role: 'owner', enabled: false });
  const roleRequest = { auth: { uid: 'premium-qa-role', token: {} }, data: {} };
  assert.equal((await premiumStatusForRequest(roleRequest)).can_manage_gifts, false);
  await assert.rejects(call('premium-qa-role', { action: 'list', userIds: ['premium-qa-alice'] }), { code: 'permission-denied' });
  await db.doc('user_roles/premium-qa-role').update({ enabled: true });
  assert.equal((await premiumStatusForRequest(roleRequest)).can_manage_gifts, true);
  assert.equal((await call('premium-qa-role', { action: 'list', userIds: ['premium-qa-alice'] })).gifts.length, 1); pass('real enabled role grants bounded status lookup; disabled role denied');
  console.log(`Premium backend emulator: ${checks} checks passed (provider Auth lookup stubbed; no live account access)`);
} finally { auth.getUser = originalLookup; await db.terminate(); }
