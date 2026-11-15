// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { assertTokenAccountCurrent, captureTokenAccount, createTokenAccountLookup, tokenAccountTransaction, type TokenAuthAccount } from '../../functions/src/_shared/tokenAccountAdmission';
const now = 1_800_000_000_999, createdAtMs = now - 10_200, authTime = Math.floor(now / 1000);
const account = (): TokenAuthAccount => ({ uid: 'caller', createdAtMs, validSince: 0, disabled: false });
const claims = () => ({ sub: 'caller', auth_time: authTime });
const raw = (patch: Record<string, unknown> = {}) => ({ localId: 'caller', createdAt: String(createdAtMs), validSince: '0', ...patch });
afterEach(() => vi.useRealTimers());
function transport(body: unknown = { users: [raw()] }) {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  const credential = vi.fn().mockResolvedValue({ access_token: 'synthetic-credential' });
  return { fetch, credential, lookup: createTokenAccountLookup({ projectId: 'vybe-daaab', fetch, credential }) };
}
describe('precise token account admission', () => {
  it('retains exact millisecond creation time through the fixed authenticated lookup', async () => {
    const { lookup, fetch, credential } = transport();
    expect(await lookup('caller')).toEqual(account()); expect(credential).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://identitytoolkit.googleapis.com/v1/projects/vybe-daaab/accounts:lookup', expect.objectContaining({ redirect: 'error', body: JSON.stringify({ localId: ['caller'] }), headers: { Authorization: 'Bearer synthetic-credential', 'Content-Type': 'application/json' } }));
  });
  it.each([{}, { users: [] }])('rejects a missing/deleted Auth account: %j', async body => {
    await expect(transport(body).lookup('caller')).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it.each([{ users: 'bad' }, { users: [raw(), raw()] }, { users: [raw({ localId: 'foreign' })] }, { users: [raw({ createdAt: '1.5' })] }, { users: [raw({ createdAt: '9007199254740992' })] }, { users: [raw({ validSince: '-1' })] }, { users: [raw({ disabled: 'false' })] }])('fails closed on malformed lookup results: %j', async body => {
    await expect(transport(body).lookup('caller')).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('keeps lookup failures generic and does not expose credential or remote error data', async () => {
    const { lookup, fetch } = transport(); fetch.mockRejectedValue(Error('synthetic-private-value'));
    await expect(lookup('caller')).rejects.toMatchObject({ code: 'unavailable', message: 'Your token account could not be checked. Please retry.' });
  });
  it('only permits an explicit loopback demo emulator and never requests production credentials there', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ users: [raw()] }))), credential = vi.fn();
    const lookup = createTokenAccountLookup({ projectId: 'demo-vybe-token-admission', emulatorHost: '127.0.0.1:9200', credential, fetch });
    await lookup('caller'); expect(credential).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:9200/identitytoolkit.googleapis.com/v1/projects/demo-vybe-token-admission/accounts:lookup');
    for (const options of [{ projectId: 'vybe-daaab', emulatorHost: '127.0.0.1:9200' }, { projectId: 'demo-vybe-token-admission' }, { projectId: 'demo-vybe-token-admission', emulatorHost: 'remote.test:9200' }, { projectId: 'foreign-project' }]) expect(() => createTokenAccountLookup({ ...options, credential, fetch })).toThrow();
  });
  it.each(['credential', 'body'])('bounds a stalled %s without issuing late network work', async stage => {
    vi.useFakeTimers(); let release!: (value: unknown) => void;
    const delayed = new Promise(resolve => { release = resolve; });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: () => delayed });
    const credential = vi.fn().mockReturnValue(stage === 'credential' ? delayed : Promise.resolve({ access_token: 'synthetic' }));
    const lookup = createTokenAccountLookup({ projectId: 'vybe-daaab', credential, fetch, timeoutMs: 100 });
    const result = lookup('caller'), rejected = expect(result).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(100); await rejected;
    release(stage === 'credential' ? { access_token: 'synthetic' } : { users: [raw()] }); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(stage === 'credential' ? 0 : 1);
  });
  it.each([{ disabled: true }, { validSince: authTime + 1 }, { createdAtMs: (authTime + 1) * 1000 }, { uid: 'foreign' }])('rejects disabled/revoked/mismatched account admission: %j', async patch => {
    await expect(captureTokenAccount('caller', claims(), async () => ({ ...account(), ...patch }), () => now)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('does not equate two account creations within one second', async () => {
    let current = account(); const context = await captureTokenAccount('caller', claims(), async () => current, () => now);
    current = { ...current, createdAtMs: current.createdAtMs + 1 };
    await expect(assertTokenAccountCurrent(context)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('checks revocation again instead of caching successful admission', async () => {
    const lookup = vi.fn().mockResolvedValueOnce(account()).mockResolvedValue({ ...account(), validSince: authTime + 1 });
    const context = await captureTokenAccount('caller', claims(), lookup, () => now);
    await expect(assertTokenAccountCurrent(context)).rejects.toMatchObject({ code: 'unauthenticated' }); expect(lookup).toHaveBeenCalledTimes(2);
  });
  it.each([{}, { auth_time: 0 }, { auth_time: 1.5 }, { auth_time: authTime + 2 }, { auth_time: authTime, sub: 'foreign' }, { auth_time: authTime, firebase: { tenant: 'other' } }])('rejects missing/malformed/future or foreign claims: %j', async input => {
    await expect(captureTokenAccount('caller', input, async () => account(), () => now)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('accepts fresh credentials at the revocation cutoff but refuses older credentials', async () => {
    const context = await captureTokenAccount('caller', claims(), async () => ({ ...account(), validSince: authTime }), () => now);
    await expect(assertTokenAccountCurrent(context)).resolves.toBeUndefined();
    await expect(captureTokenAccount('caller', { auth_time: authTime - 1 }, async () => ({ ...account(), validSince: authTime }), () => now)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('rejects forged contexts and a context borrowed from another actor before running a transaction', async () => {
    const runTransaction = vi.fn(), run = vi.fn(), db = { runTransaction } as unknown as Firestore;
    const forged = { uid: 'caller', createdAtMs, authTime };
    await expect(tokenAccountTransaction(db, { authUid: 'caller', account: forged }, run)).rejects.toMatchObject({ code: 'unauthenticated' });
    const context = await captureTokenAccount('caller', claims(), async () => account(), () => now);
    await expect(tokenAccountTransaction(db, { authUid: 'foreign', account: context }, run)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(runTransaction).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });
  it.each(['write', 'replay'])('rejects revoked admission before %s can commit/return', async operation => {
    let current = account(); const context = await captureTokenAccount('caller', claims(), async () => current, () => now);
    const committed = vi.fn();
    const db = { runTransaction: async (run: (tx: unknown) => Promise<unknown>) => { const result = await run({}); committed(); return result; } } as unknown as Firestore;
    await expect(tokenAccountTransaction(db, { authUid: 'caller', account: context }, async () => { current = { ...current, disabled: true }; return { operation, success: true }; })).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(committed).not.toHaveBeenCalled();
  });
});
