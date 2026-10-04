import { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedSnapJob } from './snapOfflineQueue';
import { createSnapDraft } from './snapDraft';

const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, online: true, rows: [] as QueuedSnapJob[], listeners: new Set<() => void>(),
  storageError: false, onlineListeners: new Set<() => void>(), upload: vi.fn(), send: vi.fn(), story: vi.fn(), chat: vi.fn(), profile: vi.fn(), bump: vi.fn() }));
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
  createIdbSnapQueueStore: () => ({ read: async () => [...state.rows], update: async (transform: (rows: QueuedSnapJob[]) => QueuedSnapJob[]) => {
    if (state.storageError) throw new Error('Device storage is full. Keep this screen open and retry.');
    state.rows = transform([...state.rows]);
  } }),
}));

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const proof = (uid: string) => ({ exists: () => true, data: () => ({ user_id: uid }) });
function switchTo(uid: string) { state.uid = uid; state.epoch++; state.listeners.forEach(notify => notify()); }
function params(id = 'draft') { return { draft: createSnapDraft({ mediaId: id, localUri: `blob:${id}`, mediaType: 'photo', conversationIds: ['chat'], storyDestinationIds: ['my_story'] }),
  file: new File(['private snap'], 'snap.jpg', { type: 'image/jpeg' }), senderId: 'alice-profile', authUserId: 'alice' }; }
function queued(id: string, ownerUid?: string): QueuedSnapJob { return { jobId: id, draft: params(id).draft, mediaBlob: params(id).file, mediaMimeType: 'image/jpeg',
  remainingConversationIds: ['chat'], remainingStoryDestinationIds: [], senderId: `${ownerUid || 'alice'}-profile`,
  ...(ownerUid ? { schemaVersion: 2, ownerUid } as const : {}), storyPublishVersion: 1, revision: `fixture-${id}`, queuedAt: Date.now(), attempts: 0, status: 'pending' }; }

beforeEach(() => {
  vi.resetModules(); state.uid = 'alice'; state.epoch = 1; state.online = true; state.rows = []; state.storageError = false; state.listeners.clear(); state.onlineListeners.clear();
  for (const fn of [state.upload, state.send, state.story, state.chat, state.profile, state.bump]) fn.mockReset();
  state.upload.mockResolvedValue({ mediaUrl: 'https://media.invalid/alice/snap.jpg' });
  state.send.mockResolvedValue({ data: { id: 'confirmed', sender_id: 'alice-profile', conversation_id: 'chat', views: [], reactions: [] }, error: null });
  state.story.mockResolvedValue(undefined); state.chat.mockResolvedValue('resolved-chat'); state.bump.mockResolvedValue(undefined);
  state.profile.mockImplementation(async (path: string) => proof(path.includes('bob-profile') ? 'bob' : 'alice'));
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => state.online);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const addEventListener = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'online' || type === 'vybe:online') state.onlineListeners.add(listener as () => void);
    else addEventListener(type, listener, options);
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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

  it('does not claim offline storage succeeded after quota failure and marks pending bubbles failed', async () => {
    state.online = false; state.storageError = true;
    const service = await import('./snapSendService'); const client = new QueryClient(); service.registerSnapSendQueryClient(client);
    service.startSnapSend(params());
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]).toMatchObject({ phase: 'failed', error: expect.stringContaining('storage is full') }));
    expect(state.rows).toEqual([]);
    expect(client.getQueryData(['messages', 'chat', 'alice', 1])).toEqual([expect.objectContaining({ _failed: true, _sending: false })]);
    state.storageError = false;
    service.retrySnapJob(service.getSnapJobSnapshots()[0].jobId);
    await waitFor(() => expect(service.getSnapJobSnapshots()[0].phase).toBe('waiting_for_connection'));
    expect(state.rows).toHaveLength(1); client.clear();
  });

  it('checkpoints a confirmed story and uploaded media before restoring only the failed DM after reload', async () => {
    const row = queued('partial', 'alice'); row.remainingStoryDestinationIds = ['my_story']; state.rows = [row];
    state.send.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', code: 'unavailable' } });
    let service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0]).toMatchObject({ status: 'failed', remainingConversationIds: ['chat'], remainingStoryDestinationIds: [], uploaded: { mediaUrl: 'https://media.invalid/alice/snap.jpg' } }));
    expect(state.story).toHaveBeenCalledTimes(1); expect(state.upload).toHaveBeenCalledTimes(1);
    state.listeners.clear(); vi.resetModules(); service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]).toMatchObject({ jobId: 'partial', phase: 'failed' }));
    service.retrySnapJob('partial');
    await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.story).toHaveBeenCalledTimes(1); expect(state.upload).toHaveBeenCalledTimes(1); expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][0].client_message_id).toBe(state.send.mock.calls[1][0].client_message_id);
  });

  it('saves resolved recipients before uploading and retry uses the saved conversations', async () => {
    const row = queued('recipient', 'alice'); row.draft.recipientIds = ['new-recipient']; state.rows = [row];
    state.upload.mockRejectedValueOnce(new Error('Upload unavailable'));
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0]).toMatchObject({ status: 'failed', draft: { recipientIds: [] }, remainingConversationIds: ['chat', 'resolved-chat'] }));
    service.retrySnapJob('recipient');
    await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.chat).toHaveBeenCalledTimes(1); expect(state.send).toHaveBeenCalledTimes(2);
  });

  it('removes a fully acknowledged saved job without uploading or delivering it again', async () => {
    const row = queued('settled', 'alice'); row.remainingConversationIds = []; state.rows = [row];
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.upload).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled(); expect(state.story).not.toHaveBeenCalled();
  });

  it('retains unresolved recipients on conversation failure instead of treating an empty resolved set as sent', async () => {
    const row = queued('unresolved', 'alice'); row.remainingConversationIds = []; row.draft.conversationIds = []; row.draft.recipientIds = ['recipient']; state.rows = [row];
    state.chat.mockRejectedValueOnce(new Error('Permission denied'));
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0]).toMatchObject({ status: 'failed', draft: { recipientIds: ['recipient'] }, lastError: expect.stringContaining('not been sent') }));
    expect(state.upload).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled();
    service.retrySnapJob('unresolved'); await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.chat).toHaveBeenCalledTimes(2); expect(state.send).toHaveBeenCalledTimes(1);
  });

  it('reuses the same server receipt identity when a story response fails as the connection goes offline', async () => {
    const row = queued('uncertain-story', 'alice'); row.remainingStoryDestinationIds = ['my_story']; state.rows = [row];
    state.story.mockImplementationOnce(async () => { state.online = false; throw new Error('Response lost'); });
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0]).toMatchObject({ status: 'pending', remainingStoryDestinationIds: ['my_story'], delivery: undefined }));
    state.online = true; switchTo('bob'); switchTo('alice');
    await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.story).toHaveBeenCalledTimes(2);
    expect(state.story.mock.calls[0][0].requestId).toBe(state.story.mock.calls[1][0].requestId);
    expect(state.story.mock.calls[1][0].expectedOwnerUid).toBe('alice');
  });

  it('does not invent a trusted receipt for a historical queued story', async () => {
    const row = queued('historical-story', 'alice'); delete row.storyPublishVersion; row.remainingStoryDestinationIds = ['my_story']; state.rows = [row];
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await waitFor(() => expect(state.rows[0]).toMatchObject({ status: 'failed', lastError: expect.stringContaining('no verified retry receipt') }));
    service.retrySnapJob('historical-story');
    await waitFor(() => expect(service.getSnapJobSnapshots()[0]?.phase).toBe('failed'));
    expect(state.story).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
  });

  it('restores the original owner’s saved job after A→B→A with fresh guards rather than reviving the old live job', async () => {
    state.online = false; const service = await import('./snapSendService'); service.startSnapSendQueue();
    service.startSnapSend({ ...params('returning'), draft: { ...params('returning').draft, storyDestinationIds: [] } });
    await waitFor(() => expect(state.rows).toHaveLength(1));
    switchTo('bob'); state.online = true; switchTo('alice');
    await waitFor(() => expect(state.rows).toEqual([]));
    expect(state.upload).toHaveBeenCalledTimes(1); expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.upload.mock.calls[0][0].authUserId).toBe('alice');
    expect(() => state.send.mock.calls[0][1].accountGuard()).not.toThrow();
  });

  it.each([false, true])('does not reschedule expired claims in a tight loop while busy/offline=%s', async offline => {
    vi.useFakeTimers();
    const upload = deferred<{ mediaUrl: string }>(); state.upload.mockReturnValue(upload.promise);
    state.rows = [queued('stalled', 'alice')];
    const service = await import('./snapSendService'); service.startSnapSendQueue();
    await vi.advanceTimersByTimeAsync(0); expect(state.upload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11 * 60_000); state.online = !offline;
    state.onlineListeners.forEach(wake => wake()); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    state.online = true; upload.resolve({ mediaUrl: 'https://media.invalid/alice/snap.jpg' }); await vi.advanceTimersByTimeAsync(0);
    expect(state.rows).toEqual([]); vi.clearAllTimers();
  });
});
