import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'auth-a' as string | null }));
const auth = vi.hoisted(() => ({ get currentUser() { return state.uid ? { uid: state.uid } : null; }, onAuthStateChanged: vi.fn(() => () => {}) }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke } }, getFirebaseAuth: () => auth }));
import { communityJoinBody, communityRequest } from './communityService';
const code = `vyc_${'A'.repeat(32)}`;
beforeEach(() => { state.uid = 'auth-a'; invoke.mockReset(); });
describe('community service client boundary', () => {
  it('joins public communities by ID without an invite code', () => expect(communityJoinBody({ serverId: 'public' })).toEqual({ serverId: 'public' }));
  it.each([code, ` ${code} `, `https://vybehub.app/community?join=${code}`])('accepts a current invitation %s', input => expect(communityJoinBody(input)).toEqual({ inviteCode: code }));
  it.each(['OLDWEAK', '', `https://other.invalid/community?join=${code}`, 'https://vybehub.app/community'])('rejects invalid and foreign invitation input %s', input => expect(() => communityJoinBody(input)).toThrow());
  it.each(['permission-denied', 'unauthenticated', 'not-found', 'resource-exhausted'])('propagates %s without direct-write fallback', async error => {
    invoke.mockResolvedValue({ data: null, error: { code: error, message: 'Unavailable' } });
    await expect(communityRequest('community-manage', { action: 'leave', serverId: 'private' })).rejects.toMatchObject({ code: error });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('retains the real Firebase shim error name', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'permission-denied', message: 'Join first' } });
    await expect(communityRequest('community-manage', {})).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('requires live authentication before transport', async () => {
    state.uid = null;
    await expect(communityRequest('community-create', {})).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('rejects stale account responses after transport', async () => {
    invoke.mockImplementation(async () => { state.uid = 'auth-b'; return { data: { server: { id: 'old-private' } }, error: null }; });
    await expect(communityRequest('community-create', {})).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('rejects empty responses instead of reporting success', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(communityRequest('community-create', {})).rejects.toThrow('invalid response');
  });
});
