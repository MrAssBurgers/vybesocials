import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedSnapJob } from './snapOfflineQueue';
import { createSnapDraft } from './snapDraft';

const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, online: true, rows: [] as QueuedSnapJob[], listeners: new Set<() => void>(),
  upload: vi.fn(), send: vi.fn(), story: vi.fn(), chat: vi.fn(), profile: vi.fn(), bump: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => ({ uid: state.uid || undefined, epoch: state.epoch }),
  reportAccountGuard: (expected = state.uid) => { const epoch = state.epoch; return () => {
    if (!expected || state.uid !== expected || epoch !== state.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
  }; },
  reportAccountSubscribe: (listener: () => void) => { state.listeners.add(listener); return () => state.listeners.delete(listener); },
  isReportSessionError: (error: { code?: string }) => error?.code === 'account-changed',
}));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: state.send, bumpConversationUpdatedAt: state.bump }));
vi.mock('@/lib/firebase/chats', () => ({ createDmChat: state.chat }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({ doc: (_db: unknown, ...parts: string[]) => parts.join('/'), getDocFromServer: state.profile }));
vi.mock('@/lib/camera/uploadSnapMedia', () => ({ uploadSnapMedia: state.upload }));
vi.mock('@/lib/camera/createStoryRecord', () => ({ createStoryRecord: state.story }));
vi.mock('@/lib/reconnectManager', () => ({ onReconnect: vi.fn() }));
vi.mock('@/lib/camera/snapOfflineQueue', async importOriginal => ({
  ...await importOriginal<typeof import('./snapOfflineQueue')>(),
  createIdbSnapQueueStore: () => ({ read: async () => [...state.rows], write: async (rows: QueuedSnapJob[]) => { state.rows = rows; } }),
}));

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const proof = (uid: string) => ({ exists: () => true, data: () => ({ user_id: uid }) });
function switchTo(uid: string) { state.uid = uid; state.epoch++; state.listeners.forEach(notify => notify()); }
function params(id = 'draft') { return { draft: createSnapDraft({ mediaId: id, localUri: `blob:${id}`, mediaType: 'photo', conversationIds: ['chat'], storyDestinationIds: ['my_story'] }),
  file: new File(['private snap'], 'snap.jpg', { type: 'image/jpeg' }), senderId: 'alice-profile', authUserId: 'alice' }; }
function queued(id: string, ownerUid?: string): QueuedSnapJob { return { jobId: id, draft: params(id).draft, mediaBlob: params(id).file, mediaMimeType: 'image/jpeg',
  remainingConversationIds: ['chat'], remainingStoryDestinationIds: [], senderId: `${ownerUid || 'alice'}-profile`,
  ...(ownerUid ? { schemaVersion: 2, ownerUid } as const : {}), queuedAt: Date.now(), attempts: 0, status: 'pending' }; }

beforeEach(() => {
  vi.resetModules(); state.uid = 'alice'; state.epoch = 1; state.online = true; state.rows = []; state.listeners.clear();
  for (const fn of [state.upload, state.send, state.story, state.chat, state.profile, state.bump]) fn.mockReset();
  state.upload.mockResolvedValue({ mediaUrl: 'https://media.invalid/alice/snap.jpg' });
  state.send.mockResolvedValue({ data: { id: 'confirmed', sender_id: 'alice-profile', conversation_id: 'chat', views: [], reactions: [] }, error: null });
  state.story.mockResolvedValue(undefined); state.chat.mockResolvedValue('resolved-chat'); state.bump.mockResolvedValue(undefined);
  state.profile.mockImplementation(async (path: string) => proof(path.includes('bob-profile') ? 'bob' : 'alice'));
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => state.online);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('snap account isolation', () => {
  it('sends verified destinations and writes confirmations only to the captured account cache', async () => {
    const service = await import('./snapSendService'); const client = new QueryClient(); service.registerSnapSendQueryClient(client);
    service.startSnapSend(params()); await waitFor(() => expect(service.getSnapJobSnapshots()[0]?.phase).toBe('sent'));
    expect(state.profile).toHaveBeenCalledWith('profiles/alice-profile');
    expect(state.upload).toHaveBeenCalledWith(expect.objectContaining({ authUserId: 'alice', accountGuard: expect.any(Function) }));
    expect(state.story).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'alice-profile', accountGuard: expect.any(Function) }));
    expect(state.send.mock.calls[0][1].accountGuard).toEqual(expect.any(Function));
    expect(client.getQueryData(['messages', 'chat', 'alice', 1])).toEqual([expect.objectContaining({ id: 'confirmed' })]);
    expect(client.getQueryData(['messages', 'chat'])).toBeUndefined(); client.clear();
  });
  it('rejects mismatched Auth input and a profile belonging to another account before upload', async () => {
    const service = await import('./snapSendService');
    expect(() => service.startSnapSend({ ...params(), authUserId: 'bob' })).toThrow('Account changed');
    state.profile.mockResolvedValue(proof('bob')); service.startSnapSend(params());
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]?.phase).toBe('failed'));
    expect(state.upload).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled(); expect(state.story).not.toHaveBeenCalled();
  });
  it('stops a stale profile lookup before optimistic writes, conversation creation or upload', async () => {
    const read = deferred<ReturnType<typeof proof>>(); state.profile.mockReturnValue(read.promise);
    const service = await import('./snapSendService'); const client = new QueryClient(); service.registerSnapSendQueryClient(client);
    service.startSnapSend({ ...params(), draft: { ...params().draft, recipientIds: ['recipient'] } }); switchTo('bob'); read.resolve(proof('alice'));
    await read.promise; await Promise.resolve();
    expect(service.getSnapJobSnapshots()).toEqual([]); expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(state.chat).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); client.clear();
  });
  it.each([false, true])('stops after an upload account change, including ABA=%s, and cannot retry the old job', async aba => {
    const upload = deferred<{ mediaUrl: string }>(); state.upload.mockReturnValue(upload.promise);
    const service = await import('./snapSendService'); const client = new QueryClient(); service.registerSnapSendQueryClient(client);
    const jobId = service.startSnapSend(params()); await waitFor(() => expect(state.upload).toHaveBeenCalledTimes(1));
    switchTo('bob'); if (aba) switchTo('alice');
    upload.resolve({ mediaUrl: 'https://media.invalid/alice/snap.jpg' }); await upload.promise; await Promise.resolve();
    expect(service.getSnapJobSnapshots()).toEqual([]); service.retrySnapJob(jobId);
    expect(state.send).not.toHaveBeenCalled(); expect(state.story).not.toHaveBeenCalled(); expect(state.upload).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['messages', 'chat', state.uid, state.epoch])).toBeUndefined(); client.clear();
  });
  it('ignores a late server confirmation and hides old-account progress after a switch', async () => {
    const sent = deferred<unknown>(); state.send.mockReturnValue(sent.promise);
    const service = await import('./snapSendService'); const client = new QueryClient(); service.registerSnapSendQueryClient(client);
    const notify = vi.fn(); const stop = service.subscribeSnapJobs(notify);
    service.startSnapSend({ ...params(), draft: { ...params().draft, storyDestinationIds: [] } }); await waitFor(() => expect(state.send).toHaveBeenCalledTimes(1));
    notify.mockClear(); switchTo('bob'); expect(notify).toHaveBeenCalled(); expect(service.getSnapJobSnapshots()).toEqual([]);
    sent.resolve({ data: { id: 'late', sender_id: 'alice-profile' }, error: null }); await sent.promise; await Promise.resolve();
    expect(client.getQueryData(['messages', 'chat', 'bob', 2])).toBeUndefined(); expect(state.bump).not.toHaveBeenCalled(); stop(); client.clear();
  });
  it('preserves same-session failed delivery retry and deterministic message identity', async () => {
    state.send.mockResolvedValueOnce({ data: null, error: { code: 'unavailable', message: 'Temporarily unavailable' } });
    const service = await import('./snapSendService'); const id = service.startSnapSend({ ...params(), draft: { ...params().draft, storyDestinationIds: [] } });
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]?.phase).toBe('failed')); service.retrySnapJob(id);
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]?.phase).toBe('sent'));
    expect(state.upload).toHaveBeenCalledTimes(1); expect(state.send.mock.calls[0][0].client_message_id).toBe(state.send.mock.calls[1][0].client_message_id);
  });
  it('persists offline jobs with the original Auth owner and resolves pending recipients only after reconnect', async () => {
    state.online = false; const service = await import('./snapSendService');
    service.startSnapSend({ ...params(), draft: { ...params().draft, recipientIds: ['recipient'] } });
    await waitFor(() => expect(state.rows).toHaveLength(1));
    expect(state.rows[0]).toMatchObject({ schemaVersion: 2, ownerUid: 'alice', senderId: 'alice-profile', draft: { recipientIds: ['recipient'] } });
    expect(state.profile).not.toHaveBeenCalled(); expect(state.chat).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
  });
  it('fails ownerless legacy rows, skips another account untouched, and still delivers the current owner’s later queued job', async () => {
    state.rows = [queued('legacy'), queued('bob-job', 'bob'), queued('alice-job', 'alice')];
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows.map(row => row.jobId)).toEqual(['legacy', 'bob-job']));
    expect(state.rows[0]).toMatchObject({ status: 'failed', lastError: expect.stringContaining('older queued snap') });
    expect(state.rows[1]).toMatchObject({ status: 'pending', attempts: 0, ownerUid: 'bob' });
    expect(state.upload).toHaveBeenCalledTimes(1); expect(state.upload.mock.calls[0][0].authUserId).toBe('alice');
    expect(state.send.mock.calls[0][0].sender_id).toBe('alice-profile');
  });
  it('does not restore a queued job whose profile no longer belongs to its recorded Auth owner', async () => {
    state.rows = [queued('wrong-profile', 'alice')]; state.profile.mockResolvedValue(proof('bob'));
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0].status).toBe('failed'));
    expect(state.upload).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
  });
});
