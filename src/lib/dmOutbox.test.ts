import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, rows: new Map<string, unknown>(), reads: vi.fn(), afterRead: undefined as undefined | (() => void), afterWrite: undefined as undefined | (() => void), storageError: false, send: vi.fn() }));
vi.mock('idb-keyval', () => ({
  get: async (key: string) => { state.reads(key); const result = state.rows.get(key); state.afterRead?.(); return result; },
  update: async (key: string, transform: (value: unknown) => unknown) => { if (state.storageError) throw new Error('Storage unavailable'); const result = transform(state.rows.get(key)); state.rows.set(key, result); state.afterWrite?.(); },
}));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountSubscribe: () => vi.fn(), isReportSessionError: (error: any) => error?.code === 'account-changed' }));
vi.mock('@/lib/dmAccountScope', () => ({ isOwnedDmActor: (id: string, uid: string) => id === uid || id === `${uid}-profile` }));
vi.mock('@/lib/reconnectManager', () => ({ onReconnect: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ inferOtherParticipantId: () => 'peer' }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: state.send }));
import { discardItem, enqueue, flush, getFailedItems, getPending, getPendingCount, retryFailedItem } from './dmOutbox';
const item = (tempId = 'temp-1', senderId = 'alice-profile') => ({ tempId, senderId, conversationId: 'room', content: 'Private draft', viewMode: 'permanent' as const, expiresAt: null });
const key = (uid: string) => `vybe-dm-outbox-v2:${uid}`;
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };
beforeEach(() => { state.session = { uid: 'alice', epoch: 1 }; state.rows.clear(); state.reads.mockClear(); state.afterRead = undefined; state.afterWrite = undefined; state.storageError = false; state.send.mockReset().mockResolvedValue({ data: { id: 'saved' }, error: null }); });
afterEach(() => vi.restoreAllMocks());

describe('authenticated-owner DM outbox', () => {
  it('never reads or sends the legacy ownerless v1 queue', async () => {
    state.rows.set('vybe-dm-outbox-v1', [{ ...item(), queuedAt: Date.now() }]);
    expect(await getPending()).toEqual([]); await flush();
    expect(state.reads).not.toHaveBeenCalledWith('vybe-dm-outbox-v1'); expect(state.send).not.toHaveBeenCalled();
  });
  it('stores one immutable request for the current owner and keeps same-payload retries idempotent', async () => {
    await enqueue(item()); await enqueue(item());
    expect(await getPendingCount()).toBe(1);
    expect(await getPending()).toEqual([expect.objectContaining({ ...item(), ownerUid: 'alice', schemaVersion: 2 })]);
    await expect(enqueue({ ...item(), content: 'Changed draft' })).rejects.toThrow('changed');
  });
  it('rejects foreign sender aliases and unauthenticated enqueue', async () => {
    await expect(enqueue(item('temp-1', 'bob-profile'))).rejects.toThrow('account');
    state.session = { uid: undefined, epoch: 2 }; await expect(enqueue(item())).rejects.toMatchObject({ code: 'account-changed' });
    expect(await getPending()).toEqual([]); expect(state.rows.size).toBe(0);
  });
  it('shows only the current owner and never dispatches a foreign row copied into that owner’s storage', async () => {
    await enqueue(item()); const aliceRows = state.rows.get(key('alice'));
    state.session = { uid: 'bob', epoch: 2 }; state.rows.set(key('bob'), aliceRows);
    expect(await getPending()).toEqual([]); await flush(); expect(state.send).not.toHaveBeenCalled();
    expect(state.rows.get(key('alice'))).toBe(aliceRows);
  });
  it('rejects late reads and explicit retry/discard from an old account epoch', async () => {
    await enqueue(item()); const session = state.session;
    state.afterRead = () => { state.session = { uid: 'alice', epoch: 3 }; };
    await expect(getPending(session)).rejects.toMatchObject({ code: 'account-changed' }); state.afterRead = undefined;
    await expect(retryFailedItem('temp-1', session)).rejects.toMatchObject({ code: 'account-changed' });
    await expect(discardItem('temp-1', session)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.rows.get(key('alice'))).toHaveLength(1);
  });
  it('fails truthfully if durable queue storage is unavailable', async () => {
    state.storageError = true; await expect(enqueue(item())).rejects.toThrow('Storage unavailable'); expect(state.rows.size).toBe(0);
  });
  it('does not claim a successful queue write after an account change at commit', async () => {
    state.afterWrite = () => { state.session = { uid: 'bob', epoch: 2 }; };
    await expect(enqueue(item())).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.rows.get(key('alice'))).toHaveLength(1); expect(state.rows.has(key('bob'))).toBe(false);
  });
  it('flushes only its owner with a captured send guard and scoped completion event', async () => {
    await enqueue(item()); const dispatch = vi.spyOn(window, 'dispatchEvent'); await flush();
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'alice-profile', client_message_id: 'temp-1' }), expect.objectContaining({ accountGuard: expect.any(Function) }));
    expect(await getPending()).toEqual([]);
    expect((dispatch.mock.calls.find(([event]) => event.type === 'vybe:dm-outbox-flush')?.[0] as CustomEvent).detail)
      .toMatchObject({ ownerUid: 'alice', accountEpoch: 1, conversationId: 'room', tempId: 'temp-1' });
  });
  it('retains a lost-ack item and suppresses completion after a send crosses accounts', async () => {
    await enqueue(item()); const reply = deferred<{ data: { id: string }; error: null }>(); state.send.mockReturnValue(reply.promise);
    const dispatch = vi.spyOn(window, 'dispatchEvent'); const pending = flush();
    for (let n = 0; n < 8; n++) await Promise.resolve();
    const oldGuard = state.send.mock.calls[0][1].accountGuard;
    state.session = { uid: 'bob', epoch: 2 }; expect(oldGuard).toThrow(); reply.resolve({ data: { id: 'saved' }, error: null }); await pending;
    expect(state.rows.get(key('alice'))).toHaveLength(1); expect(dispatch).not.toHaveBeenCalled();
    state.session = { uid: 'alice', epoch: 3 }; state.send.mockResolvedValue({ data: { id: 'saved' }, error: null }); await flush();
    expect(await getPending()).toEqual([]); expect(state.send.mock.calls[1][0].client_message_id).toBe('temp-1');
  });
  it('skips a queued item discarded while an earlier send was pending', async () => {
    await enqueue(item('first')); await enqueue(item('second')); const reply = deferred<{ data: { id: string }; error: null }>(); state.send.mockReturnValueOnce(reply.promise);
    const pending = flush(); for (let n = 0; n < 8; n++) await Promise.resolve();
    await discardItem('second'); reply.resolve({ data: { id: 'saved' }, error: null }); await pending;
    expect(state.send).toHaveBeenCalledTimes(1); expect(await getPending()).toEqual([]);
  });
  it('preserves explicit failed-item retry for the same authenticated owner', async () => {
    await enqueue(item()); state.send.mockResolvedValueOnce({ data: null, error: { message: 'Permission denied', code: 'permission-denied' } });
    await flush(); expect(await getFailedItems()).toHaveLength(1);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await retryFailedItem('temp-1')).toBe(true); expect(await getFailedItems()).toEqual([]); expect(await getPendingCount()).toBe(1);
    expect(await retryFailedItem('missing')).toBe(false);
  });
});
