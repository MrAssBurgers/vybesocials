import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ auth: null as any, uid: 'alice', epoch: 1, claims: { sub: 'alice', auth_time: 1 } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
import { prepareSecurityRevokeAttempt, checkSecurityRevokeSignIn, completeSecurityRevokeAttempt, retireSecurityRevokeAttempt } from './securitySessionAttempt';
const key = 'vybe-security-revocation-v1:alice';
const guard = () => { const epoch = mock.epoch; return () => { if (mock.uid !== 'alice' || mock.epoch !== epoch) throw Error('Account changed'); }; };
beforeEach(() => { sessionStorage.clear(); mock.uid = 'alice'; mock.epoch++; mock.claims = { sub: 'alice', auth_time: Math.floor(Date.now() / 1000) - 10 }; mock.auth = { currentUser: { uid: 'alice', getIdTokenResult: vi.fn(async () => ({ claims: { ...mock.claims } })) } }; });
afterEach(() => vi.restoreAllMocks());
it('restores the same pending attempt after module reload and newer sign-in gets a fresh ID', async () => {
  const first = await prepareSecurityRevokeAttempt('alice', guard());
  vi.resetModules(); const reloaded = await import('./securitySessionAttempt');
  expect(await reloaded.prepareSecurityRevokeAttempt('alice', guard())).toEqual(first);
  mock.claims.auth_time++; const newer = await reloaded.prepareSecurityRevokeAttempt('alice', guard()); expect(newer.requestId).not.toBe(first.requestId); expect(newer.authTime).toBe(first.authTime + 1);
  completeSecurityRevokeAttempt('alice', first.requestId, guard()); expect(JSON.parse(sessionStorage.getItem(key)!).requestId).toBe(newer.requestId);
});
it('keeps recovery until a matching confirmed receipt clears it', async () => {
  const first = await prepareSecurityRevokeAttempt('alice', guard()); completeSecurityRevokeAttempt('alice', 'other', guard()); expect(sessionStorage.getItem(key)).toBeTruthy();
  completeSecurityRevokeAttempt('alice', first.requestId, guard()); expect(sessionStorage.getItem(key)).toBeNull();
});
it.each(['malformed', 'foreign-owner', 'future-session'])('refuses blind retry of a %s recovery record until explicit retirement', async mode => {
  const first = await prepareSecurityRevokeAttempt('alice', guard());
  sessionStorage.setItem(key, mode === 'malformed' ? '{bad' : JSON.stringify({ ...first, ...(mode === 'foreign-owner' ? { ownerUid: 'bob' } : { authTime: first.authTime + 5 }) }));
  await expect(prepareSecurityRevokeAttempt('alice', guard())).rejects.toThrow('cannot be recovered'); expect(sessionStorage.getItem(key)).not.toBeNull();
  retireSecurityRevokeAttempt('alice', guard()); expect(sessionStorage.getItem(key)).toBeNull();
});
it('refuses a global mutation when durable storage cannot be written', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('storage blocked'); });
  await expect(prepareSecurityRevokeAttempt('alice', guard())).rejects.toThrow('cannot be recovered');
});
it('rejects stale and foreign token claims without generating a request', async () => {
  mock.claims.auth_time -= 600; await expect(prepareSecurityRevokeAttempt('alice', guard())).rejects.toThrow('Sign in again'); expect(sessionStorage.getItem(key)).toBeNull();
  mock.claims.sub = 'bob'; await expect(prepareSecurityRevokeAttempt('alice', guard())).rejects.toThrow('cannot be recovered');
});
it('checks newer same-UID sign-in and away-and-back epoch after asynchronous token reads', async () => {
  const first = await prepareSecurityRevokeAttempt('alice', guard()); mock.claims.auth_time++;
  await expect(checkSecurityRevokeSignIn('alice', first.authTime, guard())).rejects.toThrow('sign-in changed');
  mock.auth.currentUser.getIdTokenResult.mockImplementationOnce(async () => { mock.epoch += 2; return { claims: mock.claims }; });
  await expect(prepareSecurityRevokeAttempt('alice', guard())).rejects.toThrow('Account changed');
});
