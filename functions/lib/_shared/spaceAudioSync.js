import { randomUUID } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { spaceAudioRoomName, spaceMemberId } from './spaceAuthority.js';
/** Internal coordinator: a client may never choose an effect plan or target. */
export async function synchronizeSpaceAudioEffect(db, effectId, provider) {
    if (!/^[a-f0-9]{64}$/.test(effectId))
        throw new HttpsError('invalid-argument', 'Invalid audio change.');
    const ref = db.doc(`_space_audio_effects/${effectId}`), leaseToken = randomUUID();
    const job = await db.runTransaction(async (tx) => {
        const stored = (await tx.get(ref)).data();
        if (!stored || stored.version !== 1 || !['revoke', 'close'].includes(stored.kind) || !['pending', 'complete'].includes(stored.status)
            || typeof stored.space_id !== 'string' || !/^[a-f0-9]{64}$/.test(stored.space_id))
            throw new HttpsError('failed-precondition', 'The audio change could not be verified.');
        if (stored.status === 'complete')
            return null;
        if (Number(stored.lease_until_ms ?? 0) > Date.now())
            throw new HttpsError('unavailable', 'This audio change is already being confirmed.');
        const claimed = { ...stored, lease_token: leaseToken, lease_until_ms: Date.now() + 540000 };
        tx.update(ref, { lease_token: claimed.lease_token, lease_until_ms: claimed.lease_until_ms });
        return claimed;
    });
    if (!job)
        return;
    try {
        const roomRef = db.doc(`_space_authority/${job.space_id}`), room = (await roomRef.get()).data();
        if (!room || room.version !== 1 || room.id !== job.space_id || spaceAudioRoomName(room) !== job.roomName
            || (job.kind === 'close' && room.status !== 'ended'))
            throw new HttpsError('failed-precondition', 'The audio room changed.');
        let memberRef;
        if (job.kind === 'revoke') {
            if (typeof job.member_id !== 'string' || !/^[a-f0-9]{64}$/.test(job.member_id))
                throw new HttpsError('failed-precondition', 'The participant changed.');
            memberRef = db.doc(`_space_members/${job.member_id}`);
            const member = (await memberRef.get()).data();
            if (!member || member.version !== 1 || member.space_id !== room.id || member.id !== spaceMemberId(room.id, member.owner_uid)
                || !Array.isArray(job.identities) || job.identities.length !== 1 || job.identities[0] !== member.profile_id)
                throw new HttpsError('failed-precondition', 'The participant changed.');
        }
        const plan = { roomName: job.roomName, identities: job.identities, cutoffSeconds: job.cutoffSeconds };
        if (job.kind === 'close')
            await provider.close(plan);
        else
            await provider.revoke(plan);
        await db.runTransaction(async (tx) => {
            const fresh = (await tx.get(ref)).data();
            const currentRoom = (await tx.get(roomRef)).data();
            const currentMember = memberRef ? (await tx.get(memberRef)).data() : null;
            const endingPending = job.kind === 'close' ? await tx.get(db.collection('_space_members').where('space_id', '==', job.space_id).where('audio_pending', '==', true).limit(201)) : null;
            if (endingPending && endingPending.size > 200)
                throw new HttpsError('failed-precondition', 'The room needs another closing check.');
            const pendingJobs = endingPending ? await Promise.all(endingPending.docs.map(async (member) => {
                const data = member.data();
                if (typeof data.audio_job_id !== 'string' || !/^[a-f0-9]{64}$/.test(data.audio_job_id))
                    throw new HttpsError('failed-precondition', 'The room needs another closing check.');
                const targetRef = db.doc(`_space_audio_effects/${data.audio_job_id}`), targetJob = (await tx.get(targetRef)).data();
                if (!targetJob || targetJob.version !== 1 || targetJob.kind !== 'revoke' || targetJob.space_id !== job.space_id || targetJob.member_id !== member.id
                    || targetJob.cutoffSeconds > job.cutoffSeconds || !job.identities.includes(data.profile_id))
                    throw new HttpsError('failed-precondition', 'The room needs another closing check.');
                return { member, targetRef };
            })) : [];
            if (!fresh || fresh.status === 'complete')
                return;
            if (fresh.lease_token !== leaseToken)
                throw new HttpsError('unavailable', 'The audio change needs another confirmation.');
            if (JSON.stringify(fresh) !== JSON.stringify(job))
                throw new HttpsError('failed-precondition', 'The audio change needs a fresh check.');
            tx.update(ref, { status: 'complete', completed_at: new Date().toISOString(), lease_token: null, lease_until_ms: 0 });
            if (job.kind === 'close') {
                for (const pending of pendingJobs) {
                    tx.update(pending.member.ref, { audio_pending: false });
                    tx.update(pending.targetRef, { status: 'complete', completed_at: new Date().toISOString(), completed_by_close: effectId, lease_token: null, lease_until_ms: 0 });
                }
                // Private memberships are authoritative; ended-room UI does not use
                // the legacy participant projection as an audio admission source.
                if (currentRoom?.status === 'ended')
                    tx.update(roomRef, { audio_pending_count: 0 });
            }
            // A late acknowledgement cannot clear a newer pending role/leave change.
            if (memberRef && currentMember?.audio_job_id === effectId && currentMember.audio_pending === true) {
                tx.update(memberRef, { audio_pending: false });
                tx.update(db.doc(`space_participants/${memberRef.id}`), { audio_pending: false });
                if (currentRoom)
                    tx.update(roomRef, { audio_pending_count: Math.max(0, Number(currentRoom.audio_pending_count ?? 0) - 1) });
            }
        });
    }
    catch (error) {
        await db.runTransaction(async (tx) => {
            const fresh = (await tx.get(ref)).data();
            if (fresh?.status === 'pending' && fresh.lease_token === leaseToken)
                tx.update(ref, { lease_token: null, lease_until_ms: 0 });
        }).catch(() => { });
        throw error;
    }
}
//# sourceMappingURL=spaceAudioSync.js.map