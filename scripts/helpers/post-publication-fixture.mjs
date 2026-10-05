import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { postSourceFingerprint } from '../../functions/lib/_shared/postPublicationProof.js';

/** Test-only fixture authority. Never infer or attest production ownership. */
export async function seedPostPublication(db, id, row, owner) {
  assert.match(process.env.GCLOUD_PROJECT || '', /^demo-/);
  assert.notEqual(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
  assert.ok(owner.uid && owner.profileId);
  const batch = db.batch();
  batch.set(db.collection('posts').doc(id), row);
  batch.set(db.collection('_post_publications').doc(id), { version: 1, status: 'published', post_id: id,
    owner_uid: owner.uid, profile_id: owner.profileId, revision: randomBytes(24).toString('hex'), source_fingerprint: postSourceFingerprint(row) });
  await batch.commit();
}
