import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 0, invoke: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => {
  const epoch = mock.epoch;
  return () => { if (!uid || mock.uid !== uid || mock.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); };
} }));
import { clearDnaAdaptationData, changeDnaAction } from './dnaAdaptationService';
const confirmed = (_name: string, request: { expectedOwnerUid: string; requestId: string }) => ({ data: {
  success: true, ownerUid: request.expectedOwnerUid, requestId: request.requestId, deleted: 5,
}, error: null });
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mock.uid = 'alice'; mock.epoch++; mock.invoke.mockImplementation(confirmed); });
describe('adaptation reset confirmation', () => {
  it('requires the current account before dispatch', async () => {
    await expect(clearDnaAdaptationData('bob')).rejects.toMatchObject({ code: 'account-changed' });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it('binds the reset to the current account and validates the receipt', async () => {
    await expect(clearDnaAdaptationData('alice')).resolves.toEqual({ deleted: 5 });
    expect(mock.invoke).toHaveBeenCalledWith('clear-dna-adaptation-data', { expectedOwnerUid: 'alice', requestId: expect.any(String) });
    expect(sessionStorage.getItem('vybe-dna-reset-request:alice')).toBeNull();
  });
  it('retains the same request after transport failure instead of deleting newly created data on retry', async () => {
    mock.invoke.mockResolvedValueOnce({ error: { code: 'unavailable', message: 'Connection lost' }, data: null });
    await expect(clearDnaAdaptationData('alice')).rejects.toThrow('Connection lost');
    const request = mock.invoke.mock.calls[0][1];
    await clearDnaAdaptationData('alice');
    expect(mock.invoke.mock.calls[1][1]).toEqual(request);
    await clearDnaAdaptationData('alice');
    expect(mock.invoke.mock.calls[2][1].requestId).not.toBe(request.requestId);
  });
  it.each([null, {}, { success: true }, { success: true, ownerUid: 'bob' }])('rejects an unconfirmed response', async data => {
    mock.invoke.mockResolvedValue({ data, error: null });
    await expect(clearDnaAdaptationData('alice')).rejects.toThrow('not confirmed');
    expect(sessionStorage.getItem('vybe-dna-reset-request:alice')).toBeTruthy();
  });
  it('suppresses an old account result even after switching away and back', async () => {
    mock.invoke.mockImplementation((...args: Parameters<typeof confirmed>) => { mock.epoch += 2; return confirmed(...args); });
    await expect(clearDnaAdaptationData('alice')).rejects.toMatchObject({ code: 'account-changed' });
    expect(sessionStorage.getItem('vybe-dna-reset-request:alice')).toBeTruthy();
  });
  it('resumes an interrupted reset from another tab using its authenticated recovery receipt', async () => {
    mock.invoke.mockImplementationOnce((_name, request) => ({ data: {
      success: false, ownerUid: request.expectedOwnerUid, requestId: request.requestId, pendingRequestId: 'other-tab-reset',
    }, error: null }));
    await expect(clearDnaAdaptationData('alice')).resolves.toEqual({ deleted: 5 });
    expect(mock.invoke.mock.calls[1][1]).toEqual({ expectedOwnerUid: 'alice', requestId: 'other-tab-reset' });
  });
  it('uses the actionId contract and never accepts an old status-only success', async () => {
    mock.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(changeDnaAction('alice', 'action', true)).rejects.toThrow('not confirmed');
    expect(mock.invoke).toHaveBeenCalledWith('dna-autopilot-revert', { expectedOwnerUid: 'alice', actionId: 'action', applyPending: true });
  });
  it('reports unsupported action errors instead of claiming changes were applied', async () => {
    mock.invoke.mockResolvedValue({ data: null, error: { message: 'Applying changes is temporarily unavailable' } });
    await expect(changeDnaAction('alice', 'action', false)).rejects.toThrow('temporarily unavailable');
  });
});
