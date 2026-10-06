import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { spaceAudioRoomName, spaceMemberId } from './spaceAuthority.js';
import type { SpaceAudioRevocation } from './spaceAudioProvider.js';
type Provider = { revoke(plan: SpaceAudioRevocation): Promise<void>; close(plan: SpaceAudioRevocation): Promise<void> };

/** Internal coordinator: a client may never choose an effect plan or target. */
export async function synchronizeSpaceAudioEffect(db: Firestore, effectId: string, provider: Provider) {
  if (!/^[a-f0-9]{64}$/.test(effectId)) throw new HttpsError('invalid-argument', 'Invalid audio change.');
  const ref = db.doc(`_space_audio_effects/${effectId}`), job = (await ref.get()).data();
  if (!job || job.version !== 1 || !['revoke', 'close'].includes(job.kind) || !['pending', 'complete'].includes(job.status)
    || typeof job.space_id !== 'string' || !/^[a-f0-9]{64}$/.test(job.space_id)) throw new HttpsError('failed-precondition', 'The audio change could not be verified.');
  if (job.status === 'complete') return;
  const roomRef = db.doc(`_space_authority/${job.space_id}`), room = (await roomRef.get()).data();
  if (!room || room.version !== 1 || room.id !== job.space_id || spaceAudioRoomName(room) !== job.roomName
    || (job.kind === 'close' && room.status !== 'ended')) throw new HttpsError('failed-precondition', 'The audio room changed.');
  let memberRef: DocumentReference | undefined;
  if (job.kind === 'revoke') {
    if (typeof job.member_id !== 'string' || !/^[a-f0-9]{64}$/.test(job.member_id)) throw new HttpsError('failed-precondition', 'The participant changed.');
    memberRef = db.doc(`_space_members/${job.member_id}`);
    const member = (await memberRef.get()).data();
    if (!member || member.version !== 1 || member.space_id !== room.id || member.id !== spaceMemberId(room.id, member.owner_uid)
      || !Array.isArray(job.identities) || job.identities.length !== 1 || job.identities[0] !== member.profile_id) throw new HttpsError('failed-precondition', 'The participant changed.');
  }
  const plan: SpaceAudioRevocation = { roomName: job.roomName, identities: job.identities, cutoffSeconds: job.cutoffSeconds };
  if (job.kind === 'close') await provider.close(plan); else await provider.revoke(plan);
  await db.runTransaction(async tx => {
    const fresh = (await tx.get(ref)).data();
    const currentRoom = (await tx.get(roomRef)).data();
    const currentMember = memberRef ? (await tx.get(memberRef)).data() : null;
    if (!fresh || fresh.status === 'complete') return;
    if (JSON.stringify(fresh) !== JSON.stringify(job)) throw new HttpsError('failed-precondition', 'The audio change needs a fresh check.');
    tx.update(ref, { status: 'complete', completed_at: new Date().toISOString() });
    // A late acknowledgement cannot clear a newer pending role/leave change.
    if (memberRef && currentMember?.audio_job_id === effectId && currentMember.audio_pending === true) {
      tx.update(memberRef, { audio_pending: false });
      tx.update(db.doc(`space_participants/${memberRef.id}`), { audio_pending: false });
      if (currentRoom) tx.update(roomRef, { audio_pending_count: Math.max(0, Number(currentRoom.audio_pending_count ?? 0) - 1) });
    }
  });
}
