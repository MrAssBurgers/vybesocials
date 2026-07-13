import { describe, expect, it, vi } from 'vitest';
import { createSnapDraft } from './snapDraft';
import {
  createMemorySnapQueueStore,
  createSnapOfflineQueue,
  type QueuedSnapJob,
} from './snapOfflineQueue';

function makeJob(jobId: string): Omit<QueuedSnapJob, 'queuedAt' | 'attempts' | 'status'> {
  return {
    jobId,
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

  it('replaces a re-enqueued job instead of duplicating it', async () => {
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
