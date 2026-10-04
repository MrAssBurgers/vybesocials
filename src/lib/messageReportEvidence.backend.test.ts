// @vitest-environment node
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../functions/src/_shared/admin.js', () => ({ db: {} }));
import { inspectReport, isAttestedReport } from '../../functions/src/_shared/reportAuthority';
import { captureMessageEvidence, messageEvidenceHash, type PrivateMessageEvidence } from '../../functions/src/_shared/messageReportEvidence';

const capturedAt = '2026-10-04T12:00:00.000Z';
const evidence: PrivateMessageEvidence = {
  version: 1, report_id: 'report-1', reporter_uid: 'alice', reporter_profile_id: 'alice-profile',
  message_id: 'message-1', conversation_id: 'conversation-1', sender_uid: 'bob', sender_profile_id: 'bob-profile',
  content: '<script>This is inert evidence</script>', content_truncated: false, message_type: 'text', media_type: null,
  has_media: false, created_at: capturedAt, edited_at: null, captured_at: capturedAt, source_revision: 'a'.repeat(64),
};
const report = {
  schema_version: 2, id: 'report-1', reporter_uid: 'alice', reporter_id: 'alice-profile', target_type: 'message', target_id: 'message-1',
  target_owner_uid: 'bob', target_owner_profile_id: 'bob-profile', reason: 'harassment', details: '', created_at: capturedAt,
  target_revision: evidence.source_revision, message_evidence_hash: messageEvidenceHash(evidence), status: 'pending',
};
const authority = { ...report, version: 1, report_id: 'report-1' };
function readFixture(rows: Record<string, unknown>) {
  const paths: string[] = [];
  const db = { doc: (path: string) => ({ path }) } as unknown as Firestore;
  const tx = { get: async (ref: { path: string }) => {
    paths.push(ref.path);
    // Any attempt to load current private content is a hard regression.
    if (ref.path.startsWith('messages/') || ref.path.startsWith('conversations/')) throw new Error('Private lookup forbidden');
    return { id: ref.path.split('/').at(-1), exists: !!rows[ref.path], data: () => rows[ref.path] };
  } } as unknown as Transaction;
  return { db, tx, paths };
}

describe('staff message inspection is restricted to attested snapshots', () => {
  it('does not even look up evidence or private messages for an unverified legacy lead', async () => {
    const fixture = readFixture({ 'reports/report-1': report, '_message_report_evidence/report-1': evidence });
    const result = await inspectReport(fixture.tx, fixture.db, 'report-1');
    expect(result.report.verification).toBe('legacy');
    expect(result.target).toMatchObject({ type: 'message', available: false, caption: null });
    expect(result.target).not.toHaveProperty('messageEvidence');
    expect(fixture.paths.sort()).toEqual(['_report_authority/report-1', 'reports/report-1']);
  });
  it('returns only the captured snapshot without consulting the current message or conversation', async () => {
    const fixture = readFixture({ 'reports/report-1': report, '_report_authority/report-1': authority, '_message_report_evidence/report-1': evidence });
    const result = await inspectReport(fixture.tx, fixture.db, 'report-1');
    expect(result.target).toMatchObject({ available: true, caption: null, revision: null, messageEvidence: { content: evidence.content, capturedAt, conversationId: evidence.conversation_id } });
    expect(fixture.paths.sort()).toEqual(['_message_report_evidence/report-1', '_report_authority/report-1', 'reports/report-1']);
  });
  it('does not treat a message report without a bound evidence hash as verified', () => {
    expect(isAttestedReport({ ...report, message_evidence_hash: undefined }, { ...authority, message_evidence_hash: undefined })).toBe(false);
    expect(isAttestedReport(report, { ...authority, message_evidence_hash: 'b'.repeat(64) })).toBe(false);
  });
  it('rejects tampered evidence rather than falling back to the live message', async () => {
    const fixture = readFixture({ 'reports/report-1': report, '_report_authority/report-1': authority, '_message_report_evidence/report-1': { ...evidence, conversation_id: 'other' } });
    const result = await inspectReport(fixture.tx, fixture.db, 'report-1');
    expect(result.target.available).toBe(false); expect(result.target).not.toHaveProperty('messageEvidence');
  });
  it('uses a stable ordered digest independent of Firestore object key order', () => {
    const reversed = Object.fromEntries(Object.entries(evidence).reverse());
    expect(messageEvidenceHash(reversed)).toBe(messageEvidenceHash(evidence));
  });
  it('never splits surrogate pairs at evidence limits before hashing stored UTF-8 content', () => {
    const target = { type: 'message', id: 'message-1', conversationId: 'conversation-1', owner: { uid: 'bob', profileId: 'bob-profile' }, content: 'a'.repeat(7999) + '😀', hasMedia: true,
      row: { message_type: 'a'.repeat(63) + '😀', media_type: 'a'.repeat(79) + '😀' }, revision: evidence.source_revision } as Parameters<typeof captureMessageEvidence>[0];
    const captured = captureMessageEvidence(target, 'report-1', { uid: 'alice', profileId: 'alice-profile' }, capturedAt);
    expect(captured.content).toHaveLength(7999); expect(captured.content_truncated).toBe(true);
    expect(captured.message_type).toHaveLength(63); expect(captured.media_type).toHaveLength(79);
    expect(Buffer.from(captured.content!).toString('utf8')).toBe(captured.content);
  });
  it('normalizes malformed interior lone surrogates before creating an evidence digest', () => {
    const malformed = 'a\uD800b\uDC00c';
    const target = { type: 'message', id: 'message-1', conversationId: 'conversation-1', owner: { uid: 'bob', profileId: 'bob-profile' }, content: malformed, hasMedia: true,
      row: { message_type: malformed, media_type: malformed }, revision: evidence.source_revision } as Parameters<typeof captureMessageEvidence>[0];
    const captured = captureMessageEvidence(target, 'report-1', { uid: 'alice', profileId: 'alice-profile' }, capturedAt);
    expect(captured.content).toBe('a�b�c'); expect(captured.message_type).toBe('a�b�c'); expect(captured.media_type).toBe('a�b�c');
    expect(captured.content_truncated).toBe(false);
    expect(messageEvidenceHash({ ...captured, content: Buffer.from(captured.content!).toString('utf8') })).toBe(messageEvidenceHash(captured));
  });
});
