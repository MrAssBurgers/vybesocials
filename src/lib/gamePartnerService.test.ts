import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveGamePartnerLink, denyGamePartnerLink, formatGameUserCode, GamePartnerError, getGamePartnerLink, isGameUserCode, listGamePartnerConnections, revokeGamePartnerConnection } from './gamePartnerService';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: invoke }));
const base = { clientId: 'game-1', gameName: 'Moon Race', publisherName: 'Moon Studio', scopes: ['capture:write', 'capture:status'], expiresAt: 1000000 };
const connection = { ...base, connectionId: 'connection-1', createdAt: 1, status: 'active' };
beforeEach(() => vi.clearAllMocks());

describe('game partner callable contract', () => {
  it('uses only the public normalized code for lookup, approval, and denial', async () => {
    invoke.mockResolvedValueOnce({ data: { ...base, status: 'pending' }, error: null });
    await getGamePartnerLink('abcd-1234');
    expect(invoke).toHaveBeenLastCalledWith('getGamePartnerLink', { userCode: 'ABCD1234' });
    invoke.mockResolvedValueOnce({ data: connection, error: null });
    await approveGamePartnerLink('abcd-1234');
    expect(invoke).toHaveBeenLastCalledWith('approveGamePartnerLink', { userCode: 'ABCD1234' });
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await denyGamePartnerLink('ABCD1234');
    expect(invoke).toHaveBeenLastCalledWith('denyGamePartnerLink', { userCode: 'ABCD1234' });
  });
  it('lists and revokes with their callable payloads', async () => {
    invoke.mockResolvedValueOnce({ data: { connections: [connection] }, error: null });
    expect(await listGamePartnerConnections()).toEqual([connection]);
    expect(invoke).toHaveBeenLastCalledWith('listGamePartnerConnections', {});
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await revokeGamePartnerConnection('connection-1');
    expect(invoke).toHaveBeenLastCalledWith('revokeGamePartnerConnection', { connectionId: 'connection-1' });
  });
  it('rejects malformed codes before any callable and uses Crockford characters', () => {
    for (const code of ['', 'ABCD', 'ABCD_1234', 'ABCDI234', 'ABCDO234', 'ABCDL234', 'ABCDU234', '123456789', '<script>']) {
      expect(isGameUserCode(code)).toBe(false);
      expect(() => getGamePartnerLink(code)).toThrow(GamePartnerError);
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(formatGameUserCode(' abcd-1234 ')).toBe('ABCD-1234');
  });
  it('rejects unexpected or missing scopes instead of presenting incomplete consent', async () => {
    for (const scopes of [['capture:write', 'account:read'], ['capture:write'], ['capture:write', 'capture:write']]) {
      invoke.mockResolvedValueOnce({ data: { ...base, scopes, status: 'pending' }, error: null });
      await expect(getGamePartnerLink('ABCD1234')).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });
  it('retains callable error codes and strips unexpected response fields', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { name: 'failed-precondition', message: 'Expired' } });
    await expect(approveGamePartnerLink('ABCD1234')).rejects.toMatchObject({ code: 'failed-precondition' });
    invoke.mockResolvedValueOnce({ data: { ...base, status: 'pending', deviceCode: 'must-not-store' }, error: null });
    expect(await getGamePartnerLink('ABCD1234')).not.toHaveProperty('deviceCode');
  });
});
