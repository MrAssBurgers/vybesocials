import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { parseDnaSuggestions, saveDnaActions, runClearDnaAdaptationData } = await import('../functions/lib/dnaAdaptation.js');
const { manageDnaActions } = await import('../functions/lib/_shared/dnaActionAuthority.js');
const { DNA_THEME_PRESETS } = await import('../functions/lib/_shared/dnaThemePresets.js');
let number = 0, checks = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${name}`); checks++; };
async function fixture() {
  const uid = `dna-action-qa-${Date.now()}-${++number}`, profileId = `${uid}-profile`;
  await db.doc(`profiles/${profileId}`).set({ user_id: uid }); await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  const bind = { expectedOwnerUid: uid, expectedProfileId: profileId };
  const state = () => manageDnaActions(db, uid, { ...bind, operation: 'state' });
  const draft = async (change, generation = 'initial') => (await saveDnaActions(db, uid, generation, parseDnaSuggestions(JSON.stringify({ actions: [{ ...change, reason: 'Synthetic reviewed change' }] }), 'suggest'), profileId))[0];
  const request = (action, applyPending, requestId = randomUUID()) => ({ ...bind, operation: 'change', actionId: action.id, generation: action.generation, applyPending, requestId });
  const mutate = input => manageDnaActions(db, uid, input);
  return { uid, profileId, bind, draft, state, request, mutate };
}
try {
  await check('feed Apply and Undo change real ranking preferences and verified history together', async () => {
    const f = await fixture(), ref = db.doc(`dna_content_preferences/${f.uid}`);
    await ref.set({ user_id: f.uid, boost_topics: ['art'], discovery_level: 'balanced', custom: 'preserve' });
    const action = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['science'], reduce_topics: ['sports'] } });
    assert.equal(action.phase, 'suggested');
    const applied = await f.mutate(f.request(action, true)); assert.equal(applied.action.phase, 'applied');
    assert.deepEqual((await ref.get()).data().boost_topics, ['science']); assert.equal((await ref.get()).data().custom, 'preserve');
    assert.equal((await f.state()).actions[0].phase, 'applied');
    await f.mutate(f.request(action, false));
    assert.deepEqual((await ref.get()).data(), { user_id: f.uid, boost_topics: ['art'], discovery_level: 'balanced', custom: 'preserve' });
    assert.equal((await f.state()).actions[0].phase, 'reverted');
  });
  await check('layout change touches real UI configuration and Undo restores absent fields', async () => {
    const f = await fixture(), ref = db.doc(`user_ui_settings/${f.uid}`), before = { user_id: f.uid, ui_config: { contrastLevel: 'high', layouts: { home: [] } }, safe_mode: true };
    await ref.set(before);
    const action = await f.draft({ type: 'layout_change', patch: { fontScale: 'large', motionIntensity: 'low' } });
    const receipt = await f.mutate(f.request(action, true)); assert.equal(receipt.target.config.fontScale, 'large');
    assert.equal((await ref.get()).data().ui_config.contrastLevel, 'high');
    await f.mutate(f.request(action, false)); assert.deepEqual((await ref.get()).data(), before);
  });
  await check('theme writes actual equipped-account tokens and restores exact prior theme', async () => {
    const f = await fixture(), ref = db.doc(`user_themes/${f.uid}`), before = { user_id: f.uid, theme_tokens: DNA_THEME_PRESETS.soft, is_active: true, custom: 'keep' };
    await ref.set(before);
    const action = await f.draft({ type: 'apply_theme', preset: 'midnight' });
    const receipt = await f.mutate(f.request(action, true)); assert.equal(receipt.target.tokens.colorPrimary, DNA_THEME_PRESETS.midnight.colorPrimary);
    assert.equal((await ref.get()).data().is_active, true);
    await f.mutate(f.request(action, false)); assert.deepEqual((await ref.get()).data(), before);
  });
  await check('Undo restores a missing document, and retries cannot reapply after Undo', async () => {
    const f = await fixture(), action = await f.draft({ type: 'layout_change', patch: { buttonStyle: 'solid' } }), apply = f.request(action, true), undo = f.request(action, false);
    await f.mutate(apply); await f.mutate(apply); await f.mutate(undo); await f.mutate(undo);
    assert.equal((await db.doc(`user_ui_settings/${f.uid}`).get()).exists, false);
    await assert.rejects(f.mutate(apply), { code: 'failed-precondition' });
    assert.equal((await db.doc(`user_ui_settings/${f.uid}`).get()).exists, false);
  });
  await check('manual changes and ABA changes invalidate stale Apply and Undo', async () => {
    const f = await fixture(), ref = db.doc(`user_ui_settings/${f.uid}`); await ref.set({ user_id: f.uid, ui_config: { fontScale: 'medium' } });
    const stale = await f.draft({ type: 'layout_change', patch: { fontScale: 'large' } });
    await ref.update({ 'ui_config.fontScale': 'small' }); await ref.update({ 'ui_config.fontScale': 'medium' });
    await assert.rejects(f.mutate(f.request(stale, true)), { code: 'failed-precondition' });
    const fresh = await f.draft({ type: 'layout_change', patch: { fontScale: 'large' } }); await f.mutate(f.request(fresh, true));
    await ref.update({ 'ui_config.fontScale': 'xlarge' });
    await assert.rejects(f.mutate(f.request(fresh, false)), { code: 'failed-precondition' }); assert.equal((await ref.get()).data().ui_config.fontScale, 'xlarge');
    await assert.rejects(f.mutate(f.request(fresh, true)), { code: 'failed-precondition' });
  });
  await check('concurrent applies serialize one actual write and reject superseded plans', async () => {
    const f = await fixture(), a = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['art'] } }), b = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['science'] } });
    const results = await Promise.allSettled([f.mutate(f.request(a, true)), f.mutate(f.request(b, true))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'failed-precondition');
  });
  await check('request identifiers cannot switch actions, phase, or payload', async () => {
    const f = await fixture(), action = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['art'] } }), request = f.request(action, true);
    await f.mutate(request); await assert.rejects(f.mutate({ ...request, applyPending: false }), { code: 'failed-precondition' });
    await assert.rejects(f.mutate({ ...request, ownerUid: 'fake' }), { code: 'invalid-argument' });
    await assert.rejects(f.mutate({ ...request, expectedOwnerUid: 'other' }), { code: 'failed-precondition' });
  });
  await check('a confirmed reset invalidates old plans and receipts without resurrection', async () => {
    const f = await fixture(), action = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['art'] } }), request = f.request(action, true);
    await f.mutate(request); await runClearDnaAdaptationData(db, f.uid, { expectedOwnerUid: f.uid, requestId: randomUUID() });
    await assert.rejects(f.mutate(request), { code: 'failed-precondition' }); assert.deepEqual((await f.state()).actions, []);
    assert.equal((await db.doc(`dna_content_preferences/${f.uid}`).get()).exists, false);
    assert.equal((await db.collection('_dna_action_plans').where('owner_uid', '==', f.uid).get()).empty, true);
    assert.equal((await db.collection('_dna_action_receipts').where('owner_uid', '==', f.uid).get()).empty, true);
  });
  await check('reset versus Apply is serialized and leaves no pre-reset feed state', async () => {
    const f = await fixture(), action = await f.draft({ type: 'feed_tune', patch: { boost_topics: ['art'] } });
    await Promise.allSettled([f.mutate(f.request(action, true)), runClearDnaAdaptationData(db, f.uid, { expectedOwnerUid: f.uid, requestId: randomUUID() })]);
    assert.equal((await db.doc(`dna_content_preferences/${f.uid}`).get()).exists, false); assert.deepEqual((await f.state()).actions, []);
  });
  await check('off/paused policy blocks Apply while a safe Undo remains available', async () => {
    const f = await fixture(), action = await f.draft({ type: 'layout_change', patch: { buttonStyle: 'outline' } });
    await db.doc(`dna_agent_settings/${f.uid}`).update({ learning_paused: true }); await assert.rejects(f.mutate(f.request(action, true)), { code: 'failed-precondition' });
    await db.doc(`dna_agent_settings/${f.uid}`).update({ learning_paused: false }); await f.mutate(f.request(action, true));
    await db.doc(`dna_agent_settings/${f.uid}`).update({ mode: 'off' }); await f.mutate(f.request(action, false));
  });
  await check('settings have compare-and-set receipts and reject stale whole-setting writes', async () => {
    const f = await fixture(), state = await f.state(), request = { ...f.bind, operation: 'settings', settingsVersion: state.settingsVersion, requestId: randomUUID(), patch: { learning_paused: true } };
    const receipt = await f.mutate(request); assert.equal(receipt.settings.learning_paused, true); await f.mutate(request);
    await assert.rejects(f.mutate({ ...request, requestId: randomUUID(), patch: { mode: 'autonomous' } }), { code: 'failed-precondition' });
    await assert.rejects(f.mutate({ ...request, patch: { arbitrary: true } }), { code: 'invalid-argument' });
  });
  await check('unverified legacy labels and invalid proposal payloads never become executable', async () => {
    const f = await fixture();
    for (const change of [{ type: 'apply_theme', preset: 'external-url' }, { type: 'layout_change', patch: { safeMode: false } }, { type: 'feed_tune', patch: { boost_topics: ['art'], reduce_topics: ['art'] } }, { type: 'generate_theme' }]) {
      const action = await f.draft(change); assert.equal(action.phase, 'informational');
      await assert.rejects(f.mutate({ ...f.request(action, true), generation: 'initial' }), { code: 'failed-precondition' });
    }
    const action = await f.draft({ type: 'apply_theme', preset: 'neon' });
    await db.doc(`dna_agent_actions/${action.id}`).update({ summary: 'Tampered action' });
    assert.equal((await f.state()).actions.find(a => a.id === action.id).phase, 'informational');
    await assert.rejects(f.mutate(f.request(action, true)), { code: 'failed-precondition' });
  });
  await check('canonical identity and duplicate/foreign settings cannot be borrowed', async () => {
    const f = await fixture(); await db.doc(`user_themes/${f.uid}`).set({ user_id: 'other' });
    await assert.rejects(f.draft({ type: 'apply_theme', preset: 'neon' }), { code: 'failed-precondition' });
    await db.doc(`user_auth_index/${f.uid}`).update({ profile_id: 'foreign' }); await assert.rejects(f.state(), { code: 'failed-precondition' });
    assert.equal((await db.doc(`user_themes/${f.uid}`).get()).data().user_id, 'other');
  });
  await check('a proposal that already matches the saved settings remains informational', async () => {
    const f = await fixture(); await db.doc(`user_ui_settings/${f.uid}`).set({ user_id: f.uid, ui_config: { fontScale: 'large' } });
    const action = await f.draft({ type: 'layout_change', patch: { fontScale: 'large' } }); assert.equal(action.phase, 'informational');
  });
  await check('profile replacement retires earlier executable plans while retaining informational history', async () => {
    const f = await fixture(), action = await f.draft({ type: 'layout_change', patch: { fontScale: 'large' } });
    await db.doc(`profiles/${f.profileId}`).delete(); const profileId = `${f.uid}-replacement`;
    await db.doc(`profiles/${profileId}`).set({ user_id: f.uid }); await db.doc(`user_auth_index/${f.uid}`).set({ profile_id: profileId });
    const state = await f.mutate({ ...f.bind, expectedProfileId: profileId, operation: 'state' }); assert.equal(state.actions[0].phase, 'informational');
    await assert.rejects(f.mutate({ ...f.request(action, true), expectedProfileId: profileId }), { code: 'failed-precondition' });
  });
  console.log(`DNA actions passed ${checks} backend groups. No AI provider requests or live settings writes.`);
} finally { await db.terminate(); }
