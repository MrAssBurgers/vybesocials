import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(process.env.FIREBASE_TEST_RULES_PATH || 'firestore.rules', 'utf8') } });
const { db } = await import('../functions/lib/_shared/admin.js');
const { dispatchScheduledBrief } = await import('../functions/lib/_shared/scheduledBriefDispatch.js');
const slot = 'midday';
const fresh = () => ({ user_id: 'synthetic-alice', slot, generated_at: new Date().toISOString(), content: 'Synthetic brief', pinged: false });
let groups = 0, rules = 0;
const check = async (name, run) => { await env.clearFirestore(); await run(); groups++; console.log(`PASS ${name}`); };
const prepare = async () => { const ref = db.doc('daily_brief_cache/synthetic-alice_midday'), row = fresh(); await ref.set(row); return { ref, row }; };
try {
  await check('new pending field is visible to the real scheduled query', async () => {
    await prepare();
    assert.equal((await db.collection('daily_brief_cache').where('slot', '==', slot).where('pinged', '!=', true).get()).size, 1);
    const missing = fresh(); delete missing.pinged;
    await db.doc('daily_brief_cache/missing-flag').set(missing);
    assert.equal((await db.collection('daily_brief_cache').where('slot', '==', slot).where('pinged', '!=', true).get()).size, 1);
  });
  await check('overlapping aliases reserve once before provider work', async () => {
    const { ref, row } = await prepare(); let sends = 0;
    const results = await Promise.all(Array.from({ length: 6 }, () => dispatchScheduledBrief(db, ref, slot, row, async () => { sends++; return 1; })));
    assert.equal(sends, 1); assert.equal(results.filter(result => result.sent === 1).length, 1);
    assert.equal((await ref.get()).data().pinged, true);
  });
  await check('zero accepted targets are retryable and never mark a brief sent', async () => {
    const { ref, row } = await prepare();
    assert.equal((await dispatchScheduledBrief(db, ref, slot, row, async () => 0)).sent, 0);
    assert.equal((await ref.get()).data().pinged, false);
    assert.equal((await dispatchScheduledBrief(db, ref, slot, row, async () => 1)).sent, 1);
  });
  await check('lost provider acknowledgement cannot automatically resend', async () => {
    const { ref, row } = await prepare(); let sends = 0;
    await assert.rejects(dispatchScheduledBrief(db, ref, slot, row, async () => { sends++; throw new Error('Provider acknowledgement lost'); }));
    assert.equal((await ref.get()).data().pinged, false);
    assert.equal((await dispatchScheduledBrief(db, ref, slot, row, async () => { sends++; return 1; })).skipped, 'already-claimed');
    assert.equal(sends, 1);
  });
  await check('lost Firestore acknowledgement after provider acceptance cannot resend', async () => {
    const { ref, row } = await prepare(); let transactions = 0, sends = 0;
    const faultDb = { doc: value => db.doc(value), runTransaction: fn => ++transactions === 2 ? Promise.reject(new Error('Firestore acknowledgement lost')) : db.runTransaction(fn) };
    await assert.rejects(dispatchScheduledBrief(faultDb, ref, slot, row, async () => { sends++; return 1; }));
    await dispatchScheduledBrief(db, ref, slot, row, async () => { sends++; return 1; });
    assert.equal(sends, 1); assert.equal((await ref.get()).data().pinged, false);
  });
  await check('late provider acceptance cannot mark a replacement generation sent', async () => {
    const { ref, row } = await prepare(); const replacement = { ...row, content: 'Replacement brief' };
    await dispatchScheduledBrief(db, ref, slot, row, async () => { await ref.set(replacement); return 1; });
    assert.equal((await ref.get()).data().pinged, false);
    assert.equal((await dispatchScheduledBrief(db, ref, slot, replacement, async () => 1)).sent, 1);
  });
  await check('stale query results and invalid/expired generations never call a provider', async () => {
    const { ref, row } = await prepare(); await ref.update({ content: 'Changed before claim' }); let sends = 0;
    const send = async () => { sends++; return 1; };
    await dispatchScheduledBrief(db, ref, slot, row, send);
    for (const invalid of [{ ...row, generated_at: 'invalid' }, { ...row, generated_at: new Date(Date.now() - 25 * 3600_000).toISOString() }, { ...row, generated_at: new Date(Date.now() + 60_000).toISOString() }, { ...row, user_id: null }, { ...row, slot: 'evening' }]) await dispatchScheduledBrief(db, ref, slot, invalid, send);
    assert.equal(sends, 0);
  });
  await check('malformed provider counts preserve uncertain state without acknowledgement', async () => {
    const { ref, row } = await prepare();
    await assert.rejects(dispatchScheduledBrief(db, ref, slot, row, async () => NaN));
    assert.equal((await ref.get()).data().pinged, false);
    assert.equal((await dispatchScheduledBrief(db, ref, slot, row, async () => 1)).skipped, 'already-claimed');
  });
  await check('browser clients cannot read or forge durable delivery attempts', async () => {
    for (const context of [env.authenticatedContext('synthetic-alice'), env.authenticatedContext('other'), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
      const reference = doc(context.firestore(), '_brief_push_attempts', 'synthetic');
      for (const action of [() => getDoc(reference), () => setDoc(reference, { phase: 'failed' }), () => updateDoc(reference, { phase: 'failed' }), () => deleteDoc(reference)]) { await assertFails(action()); rules++; }
    }
  });
  console.log(`Scheduled brief dispatch: ${groups} groups, ${rules} Rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
