import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// Deliberately isolated. This fixture never uses a provider, a key or preview data.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-ai-detection-qa');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):8489$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const { db } = await import('../functions/lib/_shared/admin.js');
const { detectOwnedPostAiContent } = await import('../functions/lib/_shared/aiDetectionAuthority.js');
const { postSourceFingerprint, validPostPublication } = await import('../functions/lib/_shared/postPublicationProof.js');
const { projectPost } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const { detectAiContent } = await import('../functions/lib/ai.js');
const alice = { uid: 'ai-alice', profileId: 'profile-ai-alice', aliases: ['ai-alice', 'profile-ai-alice'], row: { username: 'alice' } };
const bob = { uid: 'ai-bob', profileId: 'profile-ai-bob' };
const sample = patch => ({ author_id: alice.profileId, user_id: alice.uid, type: 'post', caption: 'Fixture caption',
  visibility: 'public', created_at: '2026-10-04T12:00:00.000Z', media_url: '', tags: [],
  is_ai_generated: false, ai_confidence: 0.1, ai_detection_confidence: 0.1, ai_detection_reason: 'Before analysis', ...patch });
const postRef = id => db.doc(`posts/${id}`);
const proofRef = id => db.doc(`_post_publications/${id}`);
const seed = async (id, patch = {}, owner = alice) => {
  const row = sample(patch);
  await postRef(id).set(row);
  await proofRef(id).set({ version: 1, post_id: id, owner_uid: owner.uid, profile_id: owner.profileId,
    status: 'published', revision: randomBytes(24).toString('hex'), source_fingerprint: postSourceFingerprint(row) });
};
const analysis = JSON.stringify({ is_ai: true, confidence: 0.87, reason: 'Injected fixture response' });
const run = (id, analyze = async () => analysis, patch = {}, uid = alice.uid) => detectOwnedPostAiContent(db, uid, { post_id: id, caption: 'Fixture caption', ...patch }, analyze);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const heldRun = async (id, patch = {}) => {
  const entered = deferred(), resume = deferred(); let calls = 0;
  const pending = run(id, async () => { calls++; entered.resolve(); await resume.promise; return analysis; }, patch);
  await entered.promise;
  return { pending, release: resume.resolve, calls: () => calls };
};
const unchanged = async (id, before) => assert.deepEqual((await postRef(id).get()).data(), before);
let checks = 0;
const check = async (name, test) => { await test(); checks++; console.log(`PASS ${name}`); };
try {
  for (const owner of [alice, bob]) {
    await db.doc(`profiles/${owner.profileId}`).set({ user_id: owner.uid, username: owner.uid });
    await db.doc(`user_auth_index/${owner.uid}`).set({ profile_id: owner.profileId });
  }
  await check('authentication and malformed input fail before any provider work', async () => {
    await assert.rejects(detectAiContent.run({ data: { post_id: 'missing' } }), { code: 'unauthenticated' });
    let calls = 0; const analyze = async () => { calls++; return analysis; };
    for (const patch of [{ post_id: undefined }, { post_id: 'bad/path' }, { post_id: '' }, { post_id: '.' }, { post_id: '..' }, { post_id: 'x'.repeat(1501) },
      { caption: [] }, { caption: 'x'.repeat(10001) }, { image_base64: 'data:image/jpeg;base64,AQID' }, { image_base64: 'AQID!' },
      { image_base64: 'A'.repeat(2_500_004) }, { mime_type: 'text/html' }, { content_type: {} }, { author_id: bob.profileId }]) {
      await assert.rejects(run('input', analyze, patch), { code: 'invalid-argument' });
    }
    assert.equal(calls, 0);
  });
  await check('missing, foreign, ambiguous, legacy, unpublished and stale-caption posts never call the provider', async () => {
    let calls = 0; const analyze = async () => { calls++; return analysis; };
    await assert.rejects(run('missing', analyze), { code: 'not-found' });
    await seed('foreign', { author_id: bob.profileId, user_id: bob.uid }, bob);
    await assert.rejects(run('foreign', analyze), { code: 'permission-denied' });
    await seed('mixed-owner', { user_id: bob.uid });
    await assert.rejects(run('mixed-owner', analyze), { code: 'permission-denied' });
    await seed('legacy'); await proofRef('legacy').delete();
    await assert.rejects(run('legacy', analyze), { code: 'failed-precondition' });
    await seed('tombstone'); await proofRef('tombstone').update({ status: 'deleted' });
    await assert.rejects(run('tombstone', analyze), { code: 'failed-precondition' });
    await seed('stale-caption');
    await assert.rejects(run('stale-caption', analyze, { caption: 'Different content' }), { code: 'aborted' });
    await seed('empty', { caption: '' });
    await assert.rejects(run('empty', analyze, { caption: '' }), { code: 'failed-precondition' });
    await seed('deleted-flag', { is_deleted: true });
    await assert.rejects(run('deleted-flag', analyze), { code: 'failed-precondition' });
    assert.equal(calls, 0);
  });
  await check('confirmed update binds canonical account, preserves override/proof and populates the actual feed confidence field', async () => {
    const id = 'success'; await seed(id, { ai_override: false, like_count: 2, secret_fixture: 'retained' });
    let calls = 0;
    const receipt = await run(id, async input => { calls++; assert.deepEqual(input, { caption: 'Fixture caption', contentType: 'text' }); return analysis; }, { content_type: 'video' });
    assert.deepEqual(receipt, { is_ai: true, confidence: 0.87, reason: 'Injected fixture response', applied: true, postId: id, ownerUid: alice.uid, profileId: alice.profileId });
    const row = (await postRef(id).get()).data();
    assert.equal(row.ai_override, false); assert.equal(row.like_count, 2); assert.equal(row.secret_fixture, 'retained');
    assert.equal(row.ai_confidence, 0.87); assert.equal(row.ai_detection_confidence, 0.87); assert.ok(Number.isFinite(Date.parse(row.ai_checked_at)));
    assert.equal(validPostPublication(row, (await proofRef(id).get()).data(), alice, id), true);
    const dto = projectPost(id, row, { author: alice, allows: () => true, settings: { posts: 'public' } }, (await proofRef(id).get()).data(), alice.uid);
    assert.equal(dto.aiConfidence, 0.87); assert.equal(dto.aiOverride, false); assert.equal(calls, 1);
    await seed('image', { author_id: alice.uid });
    await run('image', async input => { assert.equal(input.contentType, 'image'); assert.equal(input.imageBase64, 'AQID'); assert.equal(input.mimeType, 'image/jpeg'); return analysis; }, { image_base64: 'AQID' });
  });
  await check('malformed or unavailable analysis does not write a false human-content verdict', async () => {
    const id = 'invalid-result'; await seed(id, { is_ai_generated: true, ai_confidence: 0.9 });
    const before = (await postRef(id).get()).data();
    const invalid = ['not JSON', 'null', '[]', '{}', JSON.stringify({ is_ai: 'false', confidence: 0.1, reason: 'No' }),
      ...[-1, 1.1, null, '0.5'].map(confidence => JSON.stringify({ is_ai: false, confidence, reason: 'No' })),
      JSON.stringify({ is_ai: false, confidence: 0.5, reason: '' }), JSON.stringify({ is_ai: false, confidence: 0.5, reason: 'x'.repeat(1001) }),
      JSON.stringify({ is_ai: false, confidence: 0.5, reason: 'No', author_id: bob.profileId })];
    for (const result of invalid) { await assert.rejects(run(id, async () => result), { code: 'data-loss' }); await unchanged(id, before); }
    await assert.rejects(run(id, async () => { throw new Error('injected provider unavailable'); }), /injected provider unavailable/);
    await unchanged(id, before);
    await run(id, async () => JSON.stringify({ is_ai: false, confidence: 0, reason: '  Valid negative result  ' }));
    const after = (await postRef(id).get()).data(); assert.equal(after.is_ai_generated, false); assert.equal(after.ai_detection_reason, 'Valid negative result');
  });
  await check('deletion while analysis waits cannot recreate the post', async () => {
    const id = 'delete-race'; await seed(id); const task = await heldRun(id);
    await postRef(id).delete(); task.release();
    await assert.rejects(task.pending, { code: 'aborted' }); assert.equal((await postRef(id).get()).exists, false); assert.equal(task.calls(), 1);
  });
  await check('same-ID replacement and post ABA edits cannot receive an older result', async () => {
    for (const mode of ['replacement', 'aba']) {
      const id = `recreate-${mode}`; await seed(id); const before = (await postRef(id).get()).data(); const task = await heldRun(id);
      if (mode === 'replacement') { await postRef(id).delete(); await postRef(id).set(before); }
      else { await postRef(id).update({ caption: 'Edited temporarily' }); await postRef(id).set(before); }
      task.release(); await assert.rejects(task.pending, { code: 'aborted' }); await unchanged(id, before); assert.equal(task.calls(), 1);
    }
  });
  await check('content, audience, ownership, manual override and unrelated version changes are preserved', async () => {
    for (const [key, value] of Object.entries({ caption: 'New caption', media_url: 'https://example.invalid/new.jpg', author_id: bob.profileId,
      user_id: bob.uid, ai_override: false, visibility: 'only_me', moderation_status: 'blocked', like_count: 42, is_pinned: true })) {
      const id = `edit-${key}`; await seed(id); const task = await heldRun(id); await postRef(id).update({ [key]: value });
      const edited = (await postRef(id).get()).data(); task.release(); await assert.rejects(task.pending, { code: 'aborted' }); await unchanged(id, edited);
    }
  });
  await check('publication deletion, revision change and proof ABA invalidate delayed results', async () => {
    for (const mode of ['delete', 'revision', 'aba']) {
      const id = `proof-${mode}`; await seed(id); const before = (await postRef(id).get()).data(); const original = (await proofRef(id).get()).data(); const task = await heldRun(id);
      if (mode === 'delete') await proofRef(id).delete();
      else if (mode === 'revision') await proofRef(id).update({ revision: randomBytes(24).toString('hex') });
      else { await proofRef(id).delete(); await proofRef(id).set(original); }
      task.release(); await assert.rejects(task.pending, { code: 'aborted' }); await unchanged(id, before);
    }
  });
  await check('canonical profile reassignment or alias collision during analysis cannot write under another identity', async () => {
    for (const mode of ['reassignment', 'collision']) {
      const id = `identity-${mode}`; await seed(id); const before = (await postRef(id).get()).data(); const task = await heldRun(id);
      if (mode === 'reassignment') await db.doc(`profiles/${alice.profileId}`).update({ user_id: bob.uid });
      else await db.doc(`profiles/${alice.uid}`).set({ user_id: bob.uid });
      task.release(); await assert.rejects(task.pending, { code: 'failed-precondition' }); await unchanged(id, before);
      if (mode === 'reassignment') await db.doc(`profiles/${alice.profileId}`).update({ user_id: alice.uid });
      else await db.doc(`profiles/${alice.uid}`).delete();
    }
  });
  await check('concurrent analyses have one version winner without rerunning either provider', async () => {
    const id = 'concurrent'; await seed(id); const first = await heldRun(id), second = await heldRun(id);
    first.release(); second.release();
    const outcomes = await Promise.allSettled([first.pending, second.pending]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'aborted');
    assert.equal(first.calls(), 1); assert.equal(second.calls(), 1);
  });
  console.log(`AI detection authority: ${checks} grouped checks passed with injected analysis only.`);
} finally { await db.terminate(); }
