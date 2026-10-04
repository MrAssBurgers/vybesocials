import assert from 'node:assert/strict';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { readMusicCatalog, runReadMusicCatalog, approvedMusicPreview } = await import('../functions/lib/musicCatalog.js');
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const uid = 'music-qa-alice', profileId = 'music-qa-profile';
const input = { expectedOwnerUid: uid, expectedProfileId: profileId };
const read = extra => runReadMusicCatalog(db, uid, { ...input, ...extra });
// Synthetic metadata only. This fixture neither downloads nor plays any recording.
const approved = { title: 'Synthetic local QA tone', artist: 'QA fixture', genre: 'Effects', duration: 0.5,
  preview_url: '/sounds/comment.wav', preview_seconds: 0.5, asset_kind: 'app_sound_effect', is_active: true,
  preview_approved: true, license_status: 'approved', license_reference: 'Synthetic test approval; not a production license', audio_url: 'PRIVATE-FULL-AUDIO', api_key: 'PRIVATE-PROVIDER-SECRET' };
try {
  // Reset only the exact isolated demo emulator selected above.
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(reset.ok);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: 'fixture' });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await check('requires authenticated caller and matching strict UID/profile identity', async () => {
    await assert.rejects(readMusicCatalog.run({ data: input }), { code: 'unauthenticated' });
    await assert.rejects(read({ expectedOwnerUid: 'bob' }), { code: 'failed-precondition' });
    await assert.rejects(read({ expectedProfileId: 'other' }), { code: 'failed-precondition' });
    await db.doc(`profiles/${uid}`).set({ user_id: 'bob' }); await assert.rejects(read(), { code: 'failed-precondition' }); await db.doc(`profiles/${uid}`).delete();
    await db.doc('profiles/music-duplicate').set({ user_id: uid }); await assert.rejects(read(), { code: 'failed-precondition' }); await db.doc('profiles/music-duplicate').delete();
  });
  await check('legacy and unapproved rows never become playable automatically', async () => {
    await db.doc('licensed_tracks/a-legacy').set({ ...approved, preview_approved: false });
    await db.doc('licensed_tracks/b-unknown-license').set({ ...approved, license_status: 'unknown' });
    assert.deepEqual((await read()).tracks, []); assert.equal((await read()).unavailableCount, 2);
  });
  await check('approved local effect returns only bounded public preview metadata', async () => {
    await db.doc('licensed_tracks/c-approved').set(approved); const result = await read();
    assert.equal(result.tracks.length, 1); assert.equal(result.tracks[0].track_id, 'c-approved'); assert.equal(result.tracks[0].asset_kind, 'app_sound_effect');
    assert.equal(result.tracks[0].preview_seconds, 0.5); assert.ok(!JSON.stringify(result).includes('PRIVATE')); assert.ok(!Object.hasOwn(result.tracks[0], 'license_reference'));
  });
  await check('expired approval and malformed preview sources fail closed', async () => {
    for (const patch of [{ license_expires_at: '2000-01-01' }, { license_expires_at: 'bad' }, { license_reference: '' }, { duration: 0 }, { preview_seconds: 31 }, { preview_url: '' }, { asset_kind: 'real-song' },
      ...['file:///tmp/a', 'http://example.com/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://foo.internal/a', 'https://user:pass@example.com/a', '/sounds/other.wav'].map(preview_url => ({ preview_url }))]) {
      assert.equal(approvedMusicPreview('test', { ...approved, ...patch }), null);
    }
    assert.equal(approvedMusicPreview('test', { ...approved, preview_url: 'https://audio.example.com/approved.wav' }).asset_kind, 'music_preview');
  });
  await check('revoked approval disappears on the next checked request', async () => {
    await db.doc('licensed_tracks/c-approved').update({ is_active: false }); assert.deepEqual((await read()).tracks, []);
    await db.doc('licensed_tracks/c-approved').update({ is_active: true }); assert.equal((await read()).tracks.length, 1);
  });
  await check('bounded document pagination works across pages with no approved rows', async () => {
    await Promise.all(Array.from({ length: 27 }, (_, i) => db.doc(`licensed_tracks/d-${String(i).padStart(2, '0')}`).set({ ...approved, preview_approved: i === 26 })));
    const first = await read(); assert.equal(first.nextCursor, 'd-21'); assert.equal(first.tracks.length, 1); assert.equal(first.unavailableCount, 24);
    const second = await read({ cursor: first.nextCursor }); assert.equal(second.nextCursor, null); assert.equal(second.tracks.length, 1); assert.equal(second.tracks[0].track_id, 'd-26');
    await assert.rejects(read({ cursor: '../../private' }), { code: 'invalid-argument' }); await assert.rejects(read({ collection: 'profiles' }), { code: 'invalid-argument' });
  });
  await check('callable rate limit is enforced without creating activity or provider records', async () => {
    await db.doc(`_rate_limits/music-catalog:${uid}`).set({ count: 60, reset_at: Date.now() + 60000 });
    await assert.rejects(readMusicCatalog.run({ auth: { uid, token: {} }, data: input }), { code: 'resource-exhausted' });
    assert.equal((await db.collection('track_usage').get()).size, 0); assert.equal((await db.collection('music_providers').get()).size, 0);
  });
  console.log(`Music catalog backend: ${checks} grouped checks passed.`);
} finally { await db.terminate(); }
