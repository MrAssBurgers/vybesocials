/**
 * Offline queue for snap sends. When a send starts (or fails transiently)
 * while offline, the whole draft — including the media Blob — is persisted to
 * IndexedDB and flushed on reconnect, so edits are never lost and view-once
 * pending state stays visible.
 *
 * The store is injectable so the queue logic is unit-testable without
 * IndexedDB (jsdom has none).
 */
import { get, set } from 'idb-keyval';
import type { SnapMediaDraft } from '@/lib/camera/snapDraft';

const KEY = 'vybe-snap-outbox-v1';

export interface QueuedSnapJob {
  /** Older rows without a verifiable owner must never be adopted by the active account. */
  schemaVersion?: 2;
  ownerUid?: string;
  jobId: string;
  draft: SnapMediaDraft;
  /** Media persisted as a Blob so it survives reloads (blob: URLs do not). */
  mediaBlob?: Blob;
  mediaMimeType?: string;
  /** Destinations still to deliver (already-sent ones are removed on partial success). */
  remainingConversationIds: string[];
  remainingStoryDestinationIds: string[];
  senderId: string;
  caption?: string;
  queuedAt: number;
  attempts: number;
  /** 'pending' auto-flushes on reconnect; 'failed' waits for explicit retry. */
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface SnapQueueStore {
  read(): Promise<QueuedSnapJob[]>;
  write(jobs: QueuedSnapJob[]): Promise<void>;
}

export function createIdbSnapQueueStore(): SnapQueueStore {
  return {
    async read() {
      try {
        return (await get<QueuedSnapJob[]>(KEY)) ?? [];
      } catch {
        return [];
      }
    },
    async write(jobs) {
      try {
        await set(KEY, jobs);
      } catch {
        // Quota / private mode — queue lives in memory for this session only.
      }
    },
  };
}

export function createMemorySnapQueueStore(
  initial: QueuedSnapJob[] = [],
): SnapQueueStore {
  let jobs = [...initial];
  return {
    async read() {
      return [...jobs];
    },
    async write(next) {
      jobs = [...next];
    },
  };
}

export type SnapQueueSendResult = 'sent' | 'retry_later' | 'failed' | 'skip_account';
export type SnapQueueSender = (job: QueuedSnapJob) => Promise<SnapQueueSendResult>;

export interface SnapOfflineQueue {
  enqueue(job: Omit<QueuedSnapJob, 'queuedAt' | 'attempts' | 'status'>): Promise<void>;
  list(): Promise<QueuedSnapJob[]>;
  remove(jobId: string): Promise<void>;
  update(jobId: string, patch: Partial<QueuedSnapJob>): Promise<void>;
  /** Retry a job that previously failed permanently. */
  retryFailed(jobId: string): Promise<boolean>;
  /**
   * Deliver pending jobs in order. Stops at the first transient failure
   * (offline again); permanent failures are kept with status 'failed'.
   */
  flush(send: SnapQueueSender): Promise<void>;
  onChange(cb: () => void): () => void;
}

export function createSnapOfflineQueue(store: SnapQueueStore): SnapOfflineQueue {
  const listeners = new Set<() => void>();
  let flushing = false;

  const emit = () => {
    listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        /* ignore */
      }
    });
  };

  const writeAll = async (jobs: QueuedSnapJob[]) => {
    await store.write(jobs);
    emit();
  };

  return {
    async enqueue(job) {
      const jobs = await store.read();
      // Same draft re-queued (retry while already queued) — replace, don't duplicate.
      const without = jobs.filter((j) => j.jobId !== job.jobId);
      without.push({ ...job, queuedAt: Date.now(), attempts: 0, status: 'pending' });
      await writeAll(without);
    },

    async list() {
      return store.read();
    },

    async remove(jobId) {
      const jobs = await store.read();
      await writeAll(jobs.filter((j) => j.jobId !== jobId));
    },

    async update(jobId, patch) {
      const jobs = await store.read();
      await writeAll(jobs.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)));
    },

    async retryFailed(jobId) {
      const jobs = await store.read();
      const job = jobs.find((j) => j.jobId === jobId);
      if (!job || job.status !== 'failed') return false;
      await writeAll(
        jobs.map((j) =>
          j.jobId === jobId ? { ...j, status: 'pending' as const, lastError: undefined } : j,
        ),
      );
      return true;
    },

    async flush(send) {
      if (flushing) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushing = true;
      try {
        const jobs = await store.read();
        for (const job of jobs) {
          if (job.status === 'failed') continue;

          let result: SnapQueueSendResult;
          try {
            result = await send(job);
          } catch (err) {
            result = 'failed';
            job.lastError = err instanceof Error ? err.message : 'Failed to send';
          }

          if (result === 'sent') {
            const current = await store.read();
            await writeAll(current.filter((j) => j.jobId !== job.jobId));
            continue;
          }

          // Another account's queued media must neither send nor block this
          // account's later jobs. Preserve its status and retry count unchanged.
          if (result === 'skip_account') continue;

          if (result === 'retry_later') {
            // Offline / transient — keep pending, retry on next reconnect.
            break;
          }

          const current = await store.read();
          await writeAll(
            current.map((j) =>
              j.jobId === job.jobId
                ? {
                    ...j,
                    status: 'failed' as const,
                    attempts: j.attempts + 1,
                    lastError: j.lastError || job.lastError || 'Failed to send',
                  }
                : j,
            ),
          );
        }
      } finally {
        flushing = false;
      }
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
