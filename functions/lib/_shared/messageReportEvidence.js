import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { validMembership } from './conversationMembership.js';
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && value !== '.' && value !== '..' && ![...value].some(char => char.charCodeAt(0) < 32);
const hash = (...values) => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const hex = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const iso = (value) => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
        return null;
    return new Date(value).toISOString();
};
const unavailable = (row) => row.deleted === true || row.is_deleted === true || row.is_unsent === true || row.unsent_at != null || row.deleted_at != null;
const aliases = (actor) => [...new Set([actor.uid, actor.profileId])];
// Firestore transports strings as UTF-8. Normalize invalid UTF-16 before the
// digest, then avoid splitting a valid pair at the stored length boundary.
const boundedUnicode = (value, limit) => Buffer.from(value, 'utf8').toString('utf8').slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
/** Uses the same tuple definition as message/call authorization, without its
 * legacy repair or deterministic-create paths. A report never grants access. */
async function canonicalMember(tx, db, conversationId, actor, parentMembers) {
    const ids = aliases(actor);
    const flat = await Promise.all(ids.map(id => tx.get(db.doc(`conversation_members/${conversationId}_${id}`))));
    const nested = await Promise.all(ids.map(id => tx.get(db.doc(`conversations/${conversationId}/members/${id}`))));
    for (const [index, id] of ids.entries()) {
        for (const [snapshot, isNested] of [[flat[index], false], [nested[index], true]]) {
            if (!snapshot.exists)
                continue;
            const row = snapshot.data();
            if (!validMembership(row, conversationId, id, isNested) || row.removed_at != null || row.left_at != null || row.is_active === false || row.active === false || row.is_removed === true) {
                throw new HttpsError('permission-denied', 'Conversation membership needs review');
            }
        }
    }
    return ids.some(id => parentMembers.includes(id)) || flat.some(doc => doc.exists) || nested.some(doc => doc.exists);
}
const evidenceFields = ['version', 'report_id', 'reporter_uid', 'reporter_profile_id', 'message_id', 'conversation_id', 'sender_uid', 'sender_profile_id', 'content', 'content_truncated', 'message_type', 'media_type', 'has_media', 'created_at', 'edited_at', 'captured_at', 'source_revision'];
export const messageEvidenceHash = (row) => hash(...evidenceFields.map(field => row[field]));
export async function messageReportTarget(tx, db, messageId, reporter, resolveIdentity, now) {
    const snapshot = await tx.get(db.doc(`messages/${messageId}`));
    const row = snapshot.data();
    if (!row || unavailable(row))
        throw new HttpsError('not-found', 'This message is no longer available to report');
    if ((row.id != null && row.id !== messageId) || !validId(row.conversation_id) || !validId(row.sender_id))
        throw new HttpsError('failed-precondition', 'Message identity needs review');
    if (row.expires_at != null) {
        const expires = iso(row.expires_at);
        if (!expires)
            throw new HttpsError('failed-precondition', 'Message expiry needs review');
        if (Date.parse(expires) <= now && row.saved_by_sender !== true && row.saved_by_recipient !== true)
            throw new HttpsError('not-found', 'This message is no longer available to report');
    }
    const conversationId = row.conversation_id;
    const parent = await tx.get(db.doc(`conversations/${conversationId}`));
    const conversation = parent.data();
    if (!conversation || unavailable(conversation))
        throw new HttpsError('permission-denied', 'Conversation membership could not be verified');
    if ((conversation.id != null && conversation.id !== conversationId) || (conversation.member_ids != null && (!Array.isArray(conversation.member_ids) || conversation.member_ids.length > 512 || !conversation.member_ids.every(validId))))
        throw new HttpsError('failed-precondition', 'Conversation membership needs review');
    const members = (conversation.member_ids || []);
    if (!await canonicalMember(tx, db, conversationId, reporter, members))
        throw new HttpsError('permission-denied', 'You must be a current participant to report this message');
    const owner = await resolveIdentity(row.sender_id);
    if (owner.uid === reporter.uid)
        throw new HttpsError('invalid-argument', 'Choose a message from another participant');
    if (['author_id', 'user_id', 'sender_uid', 'sender_auth_uid'].some(field => row[field] != null && !aliases(owner).includes(String(row[field]))))
        throw new HttpsError('failed-precondition', 'Message sender identity is inconsistent');
    const audit = (await tx.get(db.doc(`dm_send_audit/${messageId}`))).data();
    if (audit && (audit.message_id !== messageId || audit.conversation_id !== conversationId || !aliases(owner).includes(String(audit.sender_id)) || audit.auth_uid !== owner.uid))
        throw new HttpsError('failed-precondition', 'Message send record is inconsistent');
    // A protected send record can prove a former sender; absent that historical
    // proof, require a currently verifiable participant, never an injected name.
    if (!audit && !await canonicalMember(tx, db, conversationId, owner, members))
        throw new HttpsError('permission-denied', 'The message sender could not be verified');
    if (row.content != null && typeof row.content !== 'string' || row.text != null && typeof row.text !== 'string' || row.content != null && row.text != null && row.content !== row.text)
        throw new HttpsError('failed-precondition', 'Message content needs review');
    const content = (row.content ?? row.text ?? null);
    const hasMedia = typeof row.media_url === 'string' && row.media_url.length > 0;
    if (!content?.trim() && !hasMedia)
        throw new HttpsError('not-found', 'This message has no retained content to report');
    const revision = hash(snapshot.id, snapshot.updateTime?.seconds, snapshot.updateTime?.nanoseconds);
    return { type: 'message', id: messageId, owner, snapshot, row, revision, conversationId, content, hasMedia };
}
export function captureMessageEvidence(target, reportId, reporter, time) {
    return { version: 1, report_id: reportId, reporter_uid: reporter.uid, reporter_profile_id: reporter.profileId,
        message_id: target.id, conversation_id: target.conversationId, sender_uid: target.owner.uid, sender_profile_id: target.owner.profileId,
        content: target.content === null ? null : boundedUnicode(target.content, 8000), content_truncated: (target.content?.length || 0) > 8000,
        message_type: typeof target.row.message_type === 'string' ? boundedUnicode(target.row.message_type, 64) : 'text',
        media_type: typeof target.row.media_type === 'string' ? boundedUnicode(target.row.media_type, 80) : null, has_media: target.hasMedia,
        created_at: iso(target.row.created_at), edited_at: iso(target.row.edited_at), captured_at: time, source_revision: target.revision };
}
/** Every field is bounded and bound to the immutable report projection before
 * disclosure. No current message lookup is performed during staff inspection. */
export function verifiedMessageEvidence(snapshot, report) {
    const row = snapshot.data();
    if (!row || row.version !== 1 || snapshot.id !== report.id || row.report_id !== report.id || report.target_type !== 'message'
        || row.message_id !== report.target_id || row.reporter_uid !== report.reporter_uid || row.reporter_profile_id !== report.reporter_id
        || row.sender_uid !== report.target_owner_uid || row.sender_profile_id !== report.target_owner_profile_id
        || row.captured_at !== report.created_at || iso(row.captured_at) !== row.captured_at || row.source_revision !== report.target_revision || !hex(row.source_revision)
        || ![row.report_id, row.message_id, row.conversation_id, row.reporter_uid, row.reporter_profile_id, row.sender_uid, row.sender_profile_id].every(validId)
        || !(row.content === null || typeof row.content === 'string' && row.content.length <= 8000) || typeof row.content_truncated !== 'boolean'
        || typeof row.message_type !== 'string' || row.message_type.length > 64 || !(row.media_type === null || typeof row.media_type === 'string' && row.media_type.length <= 80)
        || typeof row.has_media !== 'boolean' || !(row.created_at === null || iso(row.created_at) === row.created_at) || !(row.edited_at === null || iso(row.edited_at) === row.edited_at)
        || !hex(report.message_evidence_hash) || messageEvidenceHash(row) !== report.message_evidence_hash)
        return null;
    return { messageId: row.message_id, conversationId: row.conversation_id, senderUid: row.sender_uid, senderProfileId: row.sender_profile_id,
        content: row.content, contentTruncated: row.content_truncated, messageType: row.message_type, mediaType: row.media_type,
        hasMedia: row.has_media, createdAt: row.created_at, editedAt: row.edited_at, capturedAt: row.captured_at };
}
//# sourceMappingURL=messageReportEvidence.js.map