import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSnapDraft } from './snapDraft';
import {
  createMemorySnapQueueStore,
  createSnapOfflineQueue,
  SNAP_QUEUE_DELIVERY_LEASE_MS,
  type QueuedSnapJob,
  type SnapQueueDelivery,
} from './snapOfflineQueue';

function makeJob(jobId: string): Omit<QueuedSnapJob, 'queuedAt' | 'attempts' | 'status'> {
  return {
    jobId,
    schemaVersion: 2,
    ownerUid: 'alice',
    draft: createSnapDraft({
      localUri: `blob:${jobId}`,
      mediaType: 'photo',
      mediaId: jobId,
      conversationIds: ['c1'],
    }),
    remainingConversationIds: ['c1'],
    remainingStoryDestinationIds: [],
    senderId: 'me',
  };
}

describe('snap offline queue', () => {
  it('enqueues with pending status and persists the draft', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    const jobs = await queue.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ jobId: 'j1', status: 'pending', attempts: 0 });
    expect(jobs[0].draft.localUri).toBe('blob:j1');
  });

  it('retains a re-enqueued job instead of duplicating it', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    await queue.enqueue(makeJob('j1'));
    expect(await queue.list()).toHaveLength(1);
  });

  it('flush removes delivered jobs in order', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    await queue.enqueue(makeJob('j2'));

    const sender = vi.fn().mockResolvedValue('sent' as const);
    await queue.flush(sender);

    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender.mock.calls.map(([j]) => j.jobId)).toEqual(['j1', 'j2']);
    expect(await queue.list()).toHaveLength(0);
  });

  it('stops at the first transient failure and keeps the job pending', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    await queue.enqueue(makeJob('j2'));

    const sender = vi.fn().mockResolvedValue('retry_later' as const);
    await queue.flush(sender);

    expect(sender).toHaveBeenCalledTimes(1);
    const jobs = await queue.list();
    expect(jobs).toHaveLength(2);
    expect(jobs[0].status).toBe('pending');
  });

  it('marks permanent failures as failed and skips them on later flushes', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    await queue.enqueue(makeJob('j2'));

    const sender = vi
      .fn()
      .mockResolvedValueOnce('failed' as const)
      .mockResolvedValue('sent' as const);
    await queue.flush(sender);

    let jobs = await queue.list();
    expect(jobs.map((j) => j.jobId)).toEqual(['j1']);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].attempts).toBe(1);

    // Failed jobs are not auto-retried…
    const sender2 = vi.fn().mockResolvedValue('sent' as const);
    await queue.flush(sender2);
    expect(sender2).not.toHaveBeenCalled();

    // …until explicitly retried.
    expect(await queue.retryFailed('j1')).toBe(true);
    await queue.flush(sender2);
    expect(sender2).toHaveBeenCalledTimes(1);
    jobs = await queue.list();
    expect(jobs).toHaveLength(0);
  });

  it('treats a throwing sender as a permanent failure with the error recorded', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));

    await queue.flush(async () => {
      throw new Error('boom');
    });

    const jobs = await queue.list();
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].lastError).toBe('boom');
  });

  it('notifies listeners on changes', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    const cb = vi.fn();
    const off = queue.onChange(cb);
    await queue.enqueue(makeJob('j1'));
    expect(cb).toHaveBeenCalled();
    off();
  });

  it('retryFailed returns false for unknown or non-failed jobs', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue(makeJob('j1'));
    expect(await queue.retryFailed('nope')).toBe(false);
    expect(await queue.retryFailed('j1')).toBe(false);
  });
});

const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
afterEach(() => vi.restoreAllMocks());

describe('atomic snap queue persistence and delivery claims', () => {
  it('retains simultaneous enqueue, patch and remove operations from independent queue instances', async () => {
    const store = createMemorySnapQueueStore(); const a = createSnapOfflineQueue(store); const b = createSnapOfflineQueue(store);
    await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? a : b).enqueue(makeJob(`job${i}`))));
    expect(await a.list()).toHaveLength(40);
    await Promise.all([a.update('job1', { lastError: 'saved error', status: 'failed' }), b.remove('job2'), a.enqueue(makeJob('new')), b.enqueue({ ...makeJob('bob'), ownerUid: 'bob' })]);
    const rows = await a.list(); expect(rows).toHaveLength(41);
    expect(rows.find(row => row.jobId === 'job1')).toMatchObject({ lastError: 'saved error', status: 'failed' });
    expect(rows.some(row => row.jobId === 'job2')).toBe(false); expect(rows.find(row => row.jobId === 'bob')?.ownerUid).toBe('bob');
  });

  it('claims a job once across two tabs and saves concurrent destination acknowledgements without loss', async () => {
    const store = createMemorySnapQueueStore(); const a = createSnapOfflineQueue(store); const b = createSnapOfflineQueue(store);
    await a.enqueue({ ...makeJob('job'), remainingConversationIds: ['c1', 'c2'], remainingStoryDestinationIds: ['my_story'] });
    const started = deferred<SnapQueueDelivery>(); const finish = deferred<'sent'>();
    const send = vi.fn(async (_job: QueuedSnapJob, delivery: SnapQueueDelivery) => { started.resolve(delivery); return finish.promise; });
    const pending = a.flush(send, { ownerUid: 'alice' }); const delivery = await started.promise;
    expect(a.isFlushing()).toBe(true);
    await b.flush(send, { ownerUid: 'alice' }); expect(send).toHaveBeenCalledTimes(1);
    await Promise.all([delivery.acknowledge('conversation', 'c1'), delivery.acknowledge('story', 'my_story'), delivery.acknowledge('conversation', 'c2')]);
    expect((await a.list())[0]).toMatchObject({ remainingConversationIds: [], remainingStoryDestinationIds: [] });
    finish.resolve('sent'); await pending; expect(await a.list()).toEqual([]); expect(a.isFlushing()).toBe(false);
  });

  it.each(['sent', 'failed'] as const)('does not apply a stale %s completion to a removed and recreated job', async result => {
    const store = createMemorySnapQueueStore(); const a = createSnapOfflineQueue(store); const b = createSnapOfflineQueue(store);
    await a.enqueue(makeJob('job')); const started = deferred<SnapQueueDelivery>(); const finish = deferred<typeof result>();
    const pending = a.flush(async (_job, delivery) => { started.resolve(delivery); return finish.promise; });
    const delivery = await started.promise; await b.remove('job'); await b.enqueue(makeJob('job'));
    await expect(delivery.check()).rejects.toThrow('changed while sending');
    finish.resolve(result); await pending;
    expect((await a.list())[0]).toMatchObject({ status: 'pending', attempts: 0, remainingConversationIds: ['c1'] });
  });

  it('does not dispatch a snapshot job removed while an earlier send is pending', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore()); await queue.enqueue(makeJob('first')); await queue.enqueue(makeJob('later'));
    const started = deferred<void>(); const finish = deferred<'sent'>();
    const send = vi.fn(async () => { started.resolve(); return finish.promise; }); const pending = queue.flush(send);
    await started.promise; await queue.remove('later'); finish.resolve('sent'); await pending; expect(send).toHaveBeenCalledTimes(1);
  });

  it('prevents a stale retry or expiry cleanup from overwriting a new delivery claim', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore()); await queue.enqueue(makeJob('job')); const before = (await queue.list())[0];
    const started = deferred<void>(); const finish = deferred<'sent'>(); const pending = queue.flush(async () => { started.resolve(); return finish.promise; });
    await started.promise;
    expect(await queue.update('job', { status: 'pending' }, { ownerUid: 'alice', expectedRevision: before.revision })).toBe(false);
    expect(await queue.remove('job', { ownerUid: 'alice', expectedRevision: before.revision })).toBe(false);
    finish.resolve('sent'); await pending; expect(await queue.list()).toEqual([]);
  });

  it('treats explicitly expected missing revision as a legacy version, not a wildcard', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore([{ ...makeJob('legacy-version'), queuedAt: Date.now(), attempts: 0, status: 'pending' }]));
    const started = deferred<void>(); const finish = deferred<'sent'>();
    const pending = queue.flush(async () => { started.resolve(); return finish.promise; }); await started.promise;
    expect(await queue.remove('legacy-version', { ownerUid: 'alice', expectedRevision: undefined })).toBe(false);
    expect(await queue.update('legacy-version', { status: 'pending' }, { ownerUid: 'alice', expectedRevision: undefined })).toBe(false);
    finish.resolve('sent'); await pending;
  });

  it('preserves immutable owner/media and receipt progress when the same draft is enqueued again', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore()); const input = makeJob('job'); await queue.enqueue(input);
    await queue.flush(async (_row, delivery) => { await delivery.acknowledge('conversation', 'c1'); return 'failed'; });
    const before = (await queue.list())[0]; await queue.enqueue(input);
    expect((await queue.list())[0]).toEqual(before);
    await expect(queue.enqueue({ ...input, ownerUid: 'bob' })).rejects.toThrow('another account or draft');
    await expect(queue.update('job', { ownerUid: 'bob' } as never)).rejects.toThrow('cannot be replaced');
    expect(await queue.remove('job', { ownerUid: 'bob' })).toBe(false);
  });

  it('reclaims an expired DM attempt but quarantines an interrupted story rather than automatically reposting it', async () => {
    const expired = Date.now() - SNAP_QUEUE_DELIVERY_LEASE_MS;
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore([
      { ...makeJob('dm'), queuedAt: Date.now(), attempts: 0, status: 'pending', delivery: { token: 'old-dm', expiresAt: expired } },
      { ...makeJob('story'), remainingStoryDestinationIds: ['my_story'], queuedAt: Date.now(), attempts: 0, status: 'pending', delivery: { token: 'old-story', expiresAt: expired } },
    ]));
    const send = vi.fn().mockResolvedValue('sent'); await queue.flush(send);
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].jobId).toBe('dm');
    expect((await queue.list())[0]).toMatchObject({ jobId: 'story', status: 'failed', lastError: expect.stringContaining('may already be posted') });
  });

  it('does not change another owner’s queue rows during a flush, mutation or retry', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore()); await queue.enqueue({ ...makeJob('bob'), ownerUid: 'bob' });
    const before = await queue.list(); const send = vi.fn(); await queue.flush(send, { ownerUid: 'alice' });
    await queue.update('bob', { status: 'failed' }, { ownerUid: 'alice' }); await queue.retryFailed('bob', { ownerUid: 'alice' });
    expect(await queue.list()).toEqual(before); expect(send).not.toHaveBeenCalled();
  });

  it('pauses an unacknowledged story after a reconnectable failure until explicit retry', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore());
    await queue.enqueue({ ...makeJob('story'), remainingStoryDestinationIds: ['my_story'] });
    await queue.flush(async (_job, delivery) => { await delivery.beginStory('my_story'); return 'retry_later'; });
    expect((await queue.list())[0]).toMatchObject({ status: 'failed', lastError: expect.stringContaining('avoid a duplicate') });
    const send = vi.fn().mockResolvedValue('sent'); await queue.flush(send); expect(send).not.toHaveBeenCalled();
    await queue.retryFailed('story'); await queue.flush(send); expect(send).toHaveBeenCalledTimes(1);
  });

  it('requires review of pre-revision owned story rows whose earlier dispatch cannot be proven', async () => {
    const queue = createSnapOfflineQueue(createMemorySnapQueueStore([{ ...makeJob('old-story'), remainingStoryDestinationIds: ['my_story'], queuedAt: Date.now(), attempts: 0, status: 'pending' }]));
    const send = vi.fn(); await queue.flush(send);
    expect(send).not.toHaveBeenCalled(); expect((await queue.list())[0]).toMatchObject({ status: 'failed', lastError: expect.stringContaining('avoid a duplicate') });
  });

  it('propagates storage read/commit failures without emitting a false saved state', async () => {
    const failure = new Error('QuotaExceededError'); const update = vi.fn().mockRejectedValue(failure);
    const queue = createSnapOfflineQueue({ read: vi.fn().mockRejectedValue(failure), update }); const listener = vi.fn(); queue.onChange(listener);
    await expect(queue.enqueue(makeJob('job'))).rejects.toBe(failure); await expect(queue.list()).rejects.toBe(failure);
    expect(listener).not.toHaveBeenCalled();
  });

  it('checks account lifetime inside the atomic updater before changing saved data', async () => {
    let current = true; const guard = () => { if (!current) throw new Error('Account changed'); };
    const stored: QueuedSnapJob[] = [];
    const queue = createSnapOfflineQueue({ read: async () => stored, update: async transform => { current = false; transform(stored); } });
    await expect(queue.enqueue(makeJob('job'), { ownerUid: 'alice', guard })).rejects.toThrow('Account changed');
    expect(stored).toEqual([]);
  });
});
