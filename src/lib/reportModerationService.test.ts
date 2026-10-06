import { getPendingModerationCount, getPostDeletionHistory } from './moderationSummaryService';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice' as string | null, listeners: new Set<(user: { uid: string } | null) => void>(), invoke: vi.fn(), directWrite: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return state.uid ? { uid: state.uid } : null; }, onAuthStateChanged: (listener: (user: { uid: string } | null) => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.directWrite } }));
import { getPendingReportCount, getReportPage, inspectSafetyReport, performReportAction, reportAccountGuard, reportAccountSnapshot, reportModerationRequest, submitSafetyReport } from './reportModerationService';

const input = { targetType: 'post' as const, targetId: 'retained-post', reason: 'spam' };
const ack = { data: { success: true, reportId: 'confirmed-report', status: 'pending' }, error: null };
const report = { id: 'report-1', verification: 'verified', targetType: 'mini_app', targetId: 'app-1', reason: 'spam', details: '', status: 'pending', createdAt: '2026-10-04T12:00:00.000Z' };
const source = { title: 'Example', description: 'Inspect me', category: 'tool', html: '<script>window.pwned=true</script>', css: '', javascript: 'fetch("https://example.invalid")' };
function switchTo(uid: string | null) { state.uid = uid; state.listeners.forEach(listener => listener(uid ? { uid } : null)); }
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); sessionStorage.clear(); state.invoke.mockReset(); state.directWrite.mockReset(); switchTo('alice'); reportAccountSnapshot(); });
afterEach(() => vi.unstubAllGlobals());

describe('server-owned moderation summaries', () => {
  it('requires an acknowledged, valid total instead of treating missing queues as zero', async () => {
    for (const data of [{}, { pendingCount: -1, includesLegacy: true }, { pendingCount: 4, includesLegacy: false }]) {
      state.invoke.mockResolvedValue({ data });
      await expect(getPendingModerationCount()).rejects.toThrow('unavailable');
    }
    state.invoke.mockResolvedValue({ data: { pendingCount: 4, includesLegacy: true } });
    expect(await getPendingModerationCount()).toBe(4);
    expect(state.directWrite).not.toHaveBeenCalled();
  });
  it('accepts bounded deletion history and drops extra fields', async () => {
    state.invoke.mockResolvedValue({ data: { entries: [{ id: 'entry', caption: 'Post', reason: 'Removed', created_at: '2026-10-01T00:00:00Z', private_token: 'hidden' }] } });
    expect(JSON.stringify(await getPostDeletionHistory())).not.toContain('hidden');
    state.invoke.mockResolvedValue({ data: { entries: Array.from({ length: 101 }, () => ({ id: 'entry' })) } });
    await expect(getPostDeletionHistory()).rejects.toThrow('verified');
  });
  it('discards history returned after the active account changes', async () => {
    state.invoke.mockImplementation(async () => { switchTo('bob'); return { data: { entries: [] } }; });
    await expect(getPostDeletionHistory()).rejects.toMatchObject({ code: 'account-changed' });
  });
});

describe('authenticated reporting request and retry boundary', () => {
  it('sends only target and reason fields; identity and review status never come from the caller', async () => {
    state.invoke.mockResolvedValue(ack);
    await submitSafetyReport({ ...input, reporter_id: 'victim', status: 'reviewed', targetOwnerUid: 'victim' } as typeof input);
    expect(state.invoke).toHaveBeenCalledWith('report-moderation', { action: 'submit', ...input, requestId: expect.any(String) });
    expect(sessionStorage.getItem('vybe-report-attempts-v1')).toBe('{}');
  });
  it('maps an older free-text reason into other plus bounded details', async () => {
    state.invoke.mockResolvedValue(ack);
    await submitSafetyReport({ ...input, reason: 'Copyright concern', details: 'a'.repeat(1200) });
    expect(state.invoke.mock.calls[0][1]).toMatchObject({ reason: 'other', details: expect.stringMatching(/^Copyright concern\n/) });
    expect(state.invoke.mock.calls[0][1].details).toHaveLength(1000);
  });
  it.each([{ ...input, targetId: '../private' }, { ...input, reason: '' }, { ...input, targetType: 'conversation' }])('rejects unsupported or malformed input before transport', async value => {
    await expect(submitSafetyReport(value as typeof input)).rejects.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'not-found', message: 'NOT_FOUND' },
    { code: 'not-found', message: 'Reported content is unavailable' },
    { name: 'unimplemented', message: 'Reporting is not deployed' },
    { code: 'permission-denied', message: 'The reported message does not exist for this account' },
    { name: 'unauthenticated', message: 'Sign in again' },
    { code: 'invalid-argument', message: 'Target 404 is invalid' },
  ])('preserves callable rejection without creating a flag: $message', async error => {
    state.invoke.mockResolvedValueOnce({ data: null, error }).mockResolvedValueOnce(ack);
    await expect(submitSafetyReport(input)).rejects.toMatchObject({ code: error.code || error.name, message: error.message });
    expect(state.directWrite).not.toHaveBeenCalled();
    // Retain the request identity until a checked server acknowledgement exists.
    await expect(submitSafetyReport(input)).resolves.toMatchObject(ack.data);
    expect(state.invoke.mock.calls[1][1]).toEqual(state.invoke.mock.calls[0][1]);
    expect(sessionStorage.getItem('vybe-report-attempts-v1')).toBe('{}');
  });
  it.each(['profile', 'post', 'comment', 'mini_app', 'message'] as const)('requires server acknowledgement for %s reports even when the endpoint is missing', async targetType => {
    state.invoke.mockResolvedValue({ data: null, error: { name: 'not-found', message: 'NOT_FOUND' } });
    await expect(submitSafetyReport({ ...input, targetType })).rejects.toMatchObject({ code: 'not-found' });
    expect(state.directWrite).not.toHaveBeenCalled();
    expect(Object.keys(JSON.parse(sessionStorage.getItem('vybe-report-attempts-v1')!))).toHaveLength(1);
  });
  it('retains the same receipt ID after an unconfirmed response and persists no report text or target ID', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Response lost' } }).mockResolvedValueOnce(ack);
    await expect(submitSafetyReport(input)).rejects.toMatchObject({ code: 'unavailable' });
    const stored = sessionStorage.getItem('vybe-report-attempts-v1')!;
    expect(stored).not.toContain(input.targetId); expect(stored).not.toContain('spam'); expect(stored).not.toContain('alice');
    expect(Object.keys(JSON.parse(stored))[0]).toMatch(/^[a-f0-9]{64}$/);
    await submitSafetyReport(input);
    expect(state.invoke.mock.calls[1][1].requestId).toBe(state.invoke.mock.calls[0][1].requestId);
  });
  it('retains the receipt after a malformed success acknowledgement', async () => {
    state.invoke.mockResolvedValueOnce({ data: { success: true, reportId: 'wrong/path', status: 'pending' } }).mockResolvedValueOnce(ack);
    await expect(submitSafetyReport(input)).rejects.toThrow('not confirmed');
    await submitSafetyReport(input);
    expect(state.invoke.mock.calls[1][1].requestId).toBe(state.invoke.mock.calls[0][1].requestId);
  });
  it('recovers a lost response retry after a same-tab reload', async () => {
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Lost' } }).mockResolvedValueOnce(ack);
    await expect(submitSafetyReport({ ...input, targetId: 'reload-case' })).rejects.toThrow('Lost');
    const requestId = state.invoke.mock.calls[0][1].requestId;
    vi.resetModules();
    const reloaded = await import('./reportModerationService');
    await reloaded.submitSafetyReport({ ...input, targetId: 'reload-case' });
    expect(state.invoke.mock.calls[1][1].requestId).toBe(requestId);
  });
  it('separates different payloads and accounts even when the previous attempt failed', async () => {
    state.invoke.mockResolvedValue({ data: null, error: { name: 'unavailable', message: 'Lost' } });
    await expect(submitSafetyReport(input)).rejects.toThrow();
    await expect(submitSafetyReport({ ...input, reason: 'harassment' })).rejects.toThrow();
    switchTo('bob');
    await expect(submitSafetyReport(input)).rejects.toThrow();
    expect(new Set(state.invoke.mock.calls.map(call => call[1].requestId)).size).toBe(3);
  });
  it('keeps in-memory retry protection when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Restricted storage'); });
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Lost' } }).mockResolvedValueOnce(ack);
    await expect(submitSafetyReport({ ...input, targetId: 'restricted-storage' })).rejects.toThrow('Lost');
    await submitSafetyReport({ ...input, targetId: 'restricted-storage' });
    expect(state.invoke.mock.calls[1][1].requestId).toBe(state.invoke.mock.calls[0][1].requestId);
    vi.restoreAllMocks();
  });
  it('rejects signed-out requests before transport', async () => {
    switchTo(null);
    await expect(submitSafetyReport(input)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it.each([false, true])('rejects a delayed completion after switching accounts (returned=%s)', async returned => {
    state.invoke.mockImplementation(async () => { switchTo('bob'); if (returned) switchTo('alice'); return ack; });
    // Ensure the original module owns the auth observer after the reload test.
    reportAccountSnapshot();
    const guard = reportAccountGuard('alice');
    await expect(submitSafetyReport(input, guard)).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('does not silently accept a missing mutation success flag', async () => {
    state.invoke.mockResolvedValue({ data: { reportId: 'r', status: 'pending' } });
    await expect(submitSafetyReport(input)).rejects.toThrow('not confirmed');
  });
});

describe('bounded moderation data and action acknowledgements', () => {
  it('reads pages without a mutation success flag and normalizes malformed legacy fields', async () => {
    state.invoke.mockResolvedValue({ data: { reports: [{ id: 'legacy', reason: {}, details: [], createdAt: 'not-a-date', reviewedAt: {}, status: 'forged', verification: 'anything' }], nextCursor: null } });
    const page = await getReportPage({ status: 'pending', cursor: 'previous' });
    expect(state.invoke).toHaveBeenCalledWith('report-moderation', { action: 'list', limit: 25, status: 'pending', cursor: 'previous' });
    expect(page.reports[0]).toMatchObject({ verification: 'legacy', reason: 'Reason unavailable', details: '', createdAt: null, reviewedAt: null, targetType: null, status: 'unknown' });
  });
  it.each([{ reports: null, nextCursor: null }, { reports: Array(51).fill(report), nextCursor: null }, { reports: [report], nextCursor: 'wrong/path' }])('fails visibly for an unverified page shape', async data => {
    state.invoke.mockResolvedValue({ data });
    await expect(getReportPage()).rejects.toThrow('could not be verified');
  });
  it.each([-1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('rejects malformed counts %s', async pendingCount => {
    state.invoke.mockResolvedValue({ data: { pendingCount, includesLegacy: true } });
    await expect(getPendingReportCount()).rejects.toThrow('unavailable');
  });
  it('requires truthful legacy-inclusive count metadata', async () => {
    state.invoke.mockResolvedValueOnce({ data: { pendingCount: 10, includesLegacy: true } }).mockResolvedValueOnce({ data: { pendingCount: 10, includesLegacy: false } });
    expect(await getPendingReportCount()).toBe(10);
    await expect(getPendingReportCount()).rejects.toThrow();
  });
  it('retains source as text and requires the inspected target to match the report', async () => {
    state.invoke.mockResolvedValue({ data: { report, target: { type: 'mini_app', id: 'app-1', available: true, revision: 'a'.repeat(64), title: source.title, source }, hold: null } });
    expect((await inspectSafetyReport('report-1')).target.source).toEqual(source);
    expect((window as unknown as { pwned?: boolean }).pwned).toBeUndefined();
    state.invoke.mockResolvedValue({ data: { report, target: { type: 'mini_app', id: 'different', available: true }, hold: null } });
    await expect(inspectSafetyReport('report-1')).rejects.toThrow('target changed');
  });
  it('does not expose an unsafe hold revision as a releasable confirmation', async () => {
    state.invoke.mockResolvedValue({ data: { report, target: { type: 'mini_app', id: 'app-1', available: false }, hold: { active: true, revision: 'not-an-audit-id', note: {} } } });
    expect((await inspectSafetyReport('report-1')).hold).toMatchObject({ active: true, revision: null, note: '' });
  });
  it('binds the hold release to the exact inspected removal event and retries the same receipt', async () => {
    const request = { action: 'releaseMiniApp', appId: 'app-1', expectedHoldRevision: 'b'.repeat(64), note: 'Reviewed corrected app' };
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Lost' } }).mockResolvedValueOnce({ data: { success: true, appId: 'app-1', holdActive: false } });
    await expect(performReportAction(request)).rejects.toThrow('Lost');
    await performReportAction(request);
    expect(state.invoke.mock.calls[1][1]).toEqual({ ...request, requestId: state.invoke.mock.calls[0][1].requestId });
  });
  it.each([
    [{ action: 'review', reportId: 'report-1', status: 'reviewed' }, { success: true, reportId: 'other', status: 'reviewed' }],
    [{ action: 'removeMiniApp', reportId: 'report-1' }, { success: true, reportId: 'report-1', status: 'reviewed' }],
    [{ action: 'releaseMiniApp', appId: 'app-1' }, { success: true, appId: 'other', holdActive: false }],
  ])('rejects a mismatched action receipt', async (request, data) => {
    state.invoke.mockResolvedValue({ data }); await expect(performReportAction(request)).rejects.toThrow('not confirmed');
  });
  it('rejects explicit empty React-account guards even while Firebase is signed in', async () => {
    await expect(reportModerationRequest({ action: 'count' }, reportAccountGuard(''))).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.invoke).not.toHaveBeenCalled();
  });
});

const messageEvidence = { messageId: 'message-1', conversationId: 'private-conversation', senderUid: 'sender', senderProfileId: 'sender-profile', content: '<img src="https://example.invalid/private" onerror="alert(1)">', contentTruncated: false, messageType: 'text', mediaType: 'image', hasMedia: true, createdAt: '2026-10-04T11:00:00.000Z', editedAt: null, capturedAt: '2026-10-04T12:00:00.000Z' };
const messageReport = { ...report, targetType: 'message', targetId: 'message-1' };
const messageInspection = (evidence: unknown = messageEvidence) => ({ report: messageReport, target: { type: 'message', id: 'message-1', ownerUid: 'sender', available: true, caption: 'Must not become a second private text copy', messageEvidence: evidence }, hold: null });

describe('private reported message evidence', () => {
  it('sends the exact message ID without caller-supplied sender, conversation or content', async () => {
    state.invoke.mockResolvedValue(ack);
    await submitSafetyReport({ targetType: 'message', targetId: 'message-1', reason: 'harassment', conversationId: 'forged', senderUid: 'victim', content: 'private text' } as Parameters<typeof submitSafetyReport>[0]);
    expect(state.invoke).toHaveBeenCalledWith('report-moderation', { action: 'submit', targetType: 'message', targetId: 'message-1', reason: 'harassment', requestId: expect.any(String) });
  });
  it('keeps only the bounded snapshot DTO, with no media URL or surrounding messages', async () => {
    state.invoke.mockResolvedValue({ data: messageInspection({ ...messageEvidence, mediaUrl: 'https://private.invalid/token', surroundingMessages: ['secret'] }) });
    const inspected = await inspectSafetyReport('report-1');
    expect(inspected.target.messageEvidence).toEqual(messageEvidence);
    expect(inspected.target.caption).toBeNull();
    expect(JSON.stringify(inspected)).not.toContain('private.invalid');
    expect(JSON.stringify(inspected)).not.toContain('surroundingMessages');
    expect(sessionStorage.length).toBe(0);
  });
  it('accepts valid captured text when a legacy message has an empty message type', async () => {
    state.invoke.mockResolvedValue({ data: messageInspection({ ...messageEvidence, messageType: '' }) });
    expect((await inspectSafetyReport('report-1')).target.messageEvidence?.content).toBe(messageEvidence.content);
  });
  it.each([
    { messageId: 'other-message' }, { senderUid: 'someone-else' }, { conversationId: 'nested/path' }, { content: 'x'.repeat(8001) },
    { content: {} }, { hasMedia: 'true' }, { capturedAt: 'not-a-date' }, { createdAt: 42 }, { contentTruncated: null },
  ])('rejects malformed or rebound snapshot fields %j', async change => {
    state.invoke.mockResolvedValue({ data: messageInspection({ ...messageEvidence, ...change }) });
    await expect(inspectSafetyReport('report-1')).rejects.toThrow('captured message could not be verified');
  });
  it('does not expose private evidence for legacy or unavailable message leads', async () => {
    state.invoke.mockResolvedValue({ data: { ...messageInspection(), report: { ...messageReport, verification: 'legacy' } } });
    await expect(inspectSafetyReport('report-1')).rejects.toThrow('captured message could not be verified');
    const data = messageInspection(); data.target.available = false;
    state.invoke.mockResolvedValue({ data: { ...data, report: { ...messageReport, verification: 'legacy' } } });
    const inspected = await inspectSafetyReport('report-1');
    expect(inspected.target.messageEvidence).toBeUndefined(); expect(inspected.target.caption).toBeNull();
  });
});
