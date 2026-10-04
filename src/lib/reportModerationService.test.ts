import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice' as string | null, listeners: new Set<(user: { uid: string } | null) => void>(), invoke: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return state.uid ? { uid: state.uid } : null; }, onAuthStateChanged: (listener: (user: { uid: string } | null) => void) => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { getPendingReportCount, getReportPage, inspectSafetyReport, performReportAction, reportAccountGuard, reportAccountSnapshot, reportModerationRequest, submitSafetyReport } from './reportModerationService';

const input = { targetType: 'post' as const, targetId: 'retained-post', reason: 'spam' };
const ack = { data: { success: true, reportId: 'confirmed-report', status: 'pending' }, error: null };
const report = { id: 'report-1', verification: 'verified', targetType: 'mini_app', targetId: 'app-1', reason: 'spam', details: '', status: 'pending', createdAt: '2026-10-04T12:00:00.000Z' };
const source = { title: 'Example', description: 'Inspect me', category: 'tool', html: '<script>window.pwned=true</script>', css: '', javascript: 'fetch("https://example.invalid")' };
function switchTo(uid: string | null) { state.uid = uid; state.listeners.forEach(listener => listener(uid ? { uid } : null)); }
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); sessionStorage.clear(); state.invoke.mockReset(); switchTo('alice'); reportAccountSnapshot(); });
afterEach(() => vi.unstubAllGlobals());

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
  it.each([{ ...input, targetId: '../private' }, { ...input, reason: '' }, { ...input, targetType: 'message' }])('rejects unsupported or malformed input before transport', async value => {
    await expect(submitSafetyReport(value as typeof input)).rejects.toThrow();
    expect(state.invoke).not.toHaveBeenCalled();
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
