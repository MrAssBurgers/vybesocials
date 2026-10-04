import assert from 'node:assert/strict';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview', 'Use an isolated test project');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runClearDnaAdaptationData, clearDnaAdaptationData, readDnaAdaptationGeneration, saveDnaActions, runDnaActionChange, parseDnaSuggestions } = await import('../functions/lib/dnaAdaptation.js');
const uid = `dna-qa-${Date.now()}`;
const input = requestId => ({ expectedOwnerUid: uid, requestId });
const reset = requestId => runClearDnaAdaptationData(db, uid, input(requestId));
const suggestions = reason => parseDnaSuggestions(JSON.stringify({ actions: [{ type: 'apply_theme', reason }] }), 'suggest');
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
await check('authentication, account binding and strict reset request', async () => {
  await assert.rejects(clearDnaAdaptationData.run({ data: input('first') }), { code: 'unauthenticated' });
  await assert.rejects(runClearDnaAdaptationData(db, 'other', input('first')), { code: 'failed-precondition' });
  for (const request of [null, {}, { ...input('first'), allUsers: true }, input('../bad')]) {
    await assert.rejects(runClearDnaAdaptationData(db, uid, request), { code: 'invalid-argument' });
  }
});
let generation;
await check('reset erases all pages of owned adaptation data while preserving personality and other accounts', async () => {
  generation = await readDnaAdaptationGeneration(db, uid);
  const batch = db.batch();
  for (let i = 0; i < 230; i++) batch.set(db.collection('dna_agent_actions').doc(`${uid}-${i}`), { user_id: uid, summary: 'Synthetic prior action' });
  batch.set(db.collection('dna_auto_theme').doc(uid), { user_id: uid, signature_colors: ['#010203'] });
  batch.set(db.collection('dna_content_preferences').doc(uid), { user_id: uid, boost_topics: ['art'], reduce_topics: ['music'], discovery_level: 'adventurous' });
  batch.set(db.collection('vybe_dna').doc(uid), { user_id: uid, vector: [1, 2] });
  batch.set(db.collection('dna_agent_settings').doc(uid), { user_id: uid, mode: 'suggest', learning_paused: false });
  batch.set(db.collection('dna_agent_actions').doc(`${uid}-other`), { user_id: 'other', summary: 'Preserve' });
  await batch.commit();
  const receipt = await reset('first');
  assert.deepEqual(receipt, { success: true, ownerUid: uid, requestId: 'first', deleted: 232 });
  for (const name of ['dna_agent_actions', 'dna_auto_theme', 'dna_content_preferences']) assert.equal((await db.collection(name).where('user_id', '==', uid).get()).empty, true);
  assert.deepEqual((await db.collection('vybe_dna').doc(uid).get()).data().vector, [1, 2]);
  assert.equal((await db.collection('dna_agent_settings').doc(uid).get()).data().mode, 'suggest');
  assert.equal((await db.collection('dna_agent_actions').doc(`${uid}-other`).get()).exists, true);
});
await check('late work cannot resurrect cleared history; newer runs remain possible', async () => {
  await assert.rejects(saveDnaActions(db, uid, generation, suggestions('Late old run')), { code: 'failed-precondition' });
  const fresh = await readDnaAdaptationGeneration(db, uid);
  assert.notEqual(fresh, generation);
  await saveDnaActions(db, uid, fresh, suggestions('New run'));
  assert.equal((await db.collection('dna_agent_actions').where('user_id', '==', uid).get()).size, 1);
});
await check('lost receipt retry cannot erase data created after the completed reset', async () => {
  assert.equal((await reset('first')).deleted, 232);
  assert.equal((await db.collection('dna_agent_actions').where('user_id', '==', uid).get()).size, 1);
});
await check('paused and opted-out settings reject in-flight action saves', async () => {
  const generation = await readDnaAdaptationGeneration(db, uid);
  for (const patch of [{ learning_paused: true }, { learning_paused: false, personalization_opted_out: true }, { personalization_opted_out: false, mode: 'off' }]) {
    await db.collection('dna_agent_settings').doc(uid).update(patch);
    await assert.rejects(saveDnaActions(db, uid, generation, suggestions('Must not save')), { code: 'failed-precondition' });
  }
  await db.collection('dna_agent_settings').doc(uid).update({ mode: 'suggest' });
});
await check('interrupted deletion stays incomplete and resumes under the same request', async () => {
  let transactions = 0;
  const interrupted = { collection: (...args) => db.collection(...args), runTransaction: (...args) => {
    transactions++;
    if (transactions === 3) throw new Error('Synthetic lost connection');
    return db.runTransaction(...args);
  } };
  await assert.rejects(runClearDnaAdaptationData(interrupted, uid, input('resumable')), /Synthetic lost connection/);
  assert.equal((await db.collection('_dna_adaptation_state').doc(uid).get()).data().resetting, true);
  assert.deepEqual(await reset('competing'), { success: false, ownerUid: uid, requestId: 'competing', pendingRequestId: 'resumable' });
  await assert.rejects(readDnaAdaptationGeneration(db, uid), { code: 'failed-precondition' });
  assert.equal((await reset('resumable')).success, true);
  assert.equal((await db.collection('_dna_adaptation_state').doc(uid).get()).data().resetting, false);
});
await check('simultaneous retries share one generation and receipt', async () => {
  const receipts = await Promise.all([reset('same'), reset('same')]);
  assert.deepEqual(receipts[0], receipts[1]);
});
await check('reset allowance does not block confirmed receipt recovery', async () => {
  await db.collection('_dna_adaptation_state').doc(uid).update({ reset_count: 10 });
  await assert.rejects(reset('new-over-limit'), { code: 'resource-exhausted' });
  assert.equal((await reset('same')).success, true);
});
await check('generated suggestions are bounded and never labelled as applied', async () => {
  const parsed = parseDnaSuggestions(JSON.stringify({ actions: [null, {}, { type: 'unknown', reason: 'No' },
    { type: 'apply_theme', reason: 'x'.repeat(501) }, ...Array.from({ length: 8 }, () => ({ type: 'apply_theme', reason: 'Try a softer palette' }))] }), 'autonomous');
  assert.equal(parsed.length, 3);
  assert.ok(parsed.every(action => action.applied === false && action.before === null && action.after === null));
  assert.deepEqual(parseDnaSuggestions('broken JSON', 'suggest'), []);
  const generation = await readDnaAdaptationGeneration(db, uid);
  for (const malformed of [[null], [...parsed, parsed[0]], [{ ...parsed[0], applied: true }], [{ ...parsed[0], owner_uid: 'other' }]]) {
    await assert.rejects(saveDnaActions(db, uid, generation, malformed), { code: 'invalid-argument' });
  }
});
await check('apply and undo reject unsupported actions without changing labels or settings', async () => {
  const id = `${uid}-unsupported`;
  const original = { user_id: uid, status: 'applied', reason: 'Legacy suggestion' };
  await db.collection('dna_agent_actions').doc(id).set(original);
  for (const applyPending of [true, false]) {
    await assert.rejects(runDnaActionChange(db, uid, { expectedOwnerUid: uid, actionId: id, applyPending }), { code: 'failed-precondition' });
    assert.deepEqual((await db.collection('dna_agent_actions').doc(id).get()).data(), original);
  }
  await assert.rejects(runDnaActionChange(db, 'other', { expectedOwnerUid: 'other', actionId: id, applyPending: true }), { code: 'permission-denied' });
  await assert.rejects(runDnaActionChange(db, uid, { expectedOwnerUid: 'other', actionId: id, applyPending: true }), { code: 'failed-precondition' });
  await assert.rejects(runDnaActionChange(db, uid, { expectedOwnerUid: uid, action_id: id, applyPending: true }), { code: 'invalid-argument' });
});
console.log(`DNA adaptation backend passed ${checks} grouped checks`);
