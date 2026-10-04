/**
 * Offline queue for snap sends. When a send starts (or fails transiently)
 * while offline, the whole draft — including the media Blob — is persisted to
 * IndexedDB and flushed on reconnect, so edits are never lost and view-once
 * pending state stays visible.
 *
 * The store is injectable so the queue logic is unit-testable without
 * IndexedDB (jsdom has none).
 */
import { get, update as updateIdb } from 'idb-keyval';
import type { SnapMediaDraft } from '@/lib/camera/snapDraft';

const KEY = 'vybe-snap-outbox-v1';

export interface QueuedSnapJob {
  /** Older rows without a verifiable owner must never be adopted by the active account. */
  schemaVersion?: 2;
  /** Only new drafts use the server's permanent story publish receipt. */
  storyPublishVersion?: 1;
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
  /** Changes whenever an external mutation replaces this delivery attempt. */
  revision?: string;
  delivery?: { token: string; expiresAt: number };
  uploaded?: { mediaUrl: string; thumbnailUrl?: string };
  /** Dispatch was recorded but the story acknowledgement is not yet durable. */
  attemptedStoryDestinationIds?: string[];
}

export interface SnapQueueStore {
  read(): Promise<QueuedSnapJob[]>;
  /** Synchronous transform executed inside one serialized storage transaction. */
  update(transform: (jobs: QueuedSnapJob[]) => QueuedSnapJob[]): Promise<void>;
}

function decodeQueue(value: unknown): QueuedSnapJob[] {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || typeof row.jobId !== 'string')) throw new Error('The saved snap queue could not be read. It has not been overwritten.');
  return value;
}

export function createIdbSnapQueueStore(): SnapQueueStore {
  return {
    async read() {
      return decodeQueue(await get<unknown>(KEY));
    },
    async update(transform) {
      await updateIdb<unknown>(KEY, stored => transform(decodeQueue(stored)));
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
    async update(transform) {
      jobs = transform([...jobs]);
    },
  };
}

export type SnapQueueSendResult = 'sent' | 'retry_later' | 'failed' | 'skip_account';
export interface SnapQueueOperation { ownerUid?: string; guard?: () => void; expectedRevision?: string }
export interface SnapQueueDelivery {
  /** Check/renew this delivery claim after a long async stage. */
  check(): Promise<void>;
  prepare(conversationIds: string[]): Promise<void>;
  uploaded(value: NonNullable<QueuedSnapJob['uploaded']>): Promise<void>;
  beginStory(id: string): Promise<void>;
  acknowledge(kind: 'conversation' | 'story', id: string): Promise<void>;
}
export type SnapQueueSender = (job: QueuedSnapJob, delivery: SnapQueueDelivery) => Promise<SnapQueueSendResult>;
export const SNAP_QUEUE_DELIVERY_LEASE_MS = 10 * 60_000;
type QueuePatch = Partial<Pick<QueuedSnapJob, 'status' | 'lastError' | 'attempts' | 'remainingConversationIds' | 'remainingStoryDestinationIds'>>;
const newRevision = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const STORY_REVIEW_MESSAGE = 'A story may already be posted. Check your story before retrying to avoid a duplicate.';
const immutableIdentity = (row: Pick<QueuedSnapJob, 'schemaVersion' | 'storyPublishVersion' | 'ownerUid' | 'senderId' | 'draft' | 'caption' | 'mediaMimeType' | 'mediaBlob'>) => JSON.stringify([
  row.schemaVersion, row.storyPublishVersion, row.ownerUid, row.senderId, row.draft.mediaId, row.draft.clientMessageId, row.draft.mediaType, row.draft.viewMode,
  row.draft.replyToMessageId, row.caption, row.mediaMimeType, row.mediaBlob?.size, row.mediaBlob?.type,
]);

export interface SnapOfflineQueue {
  enqueue(job: Omit<QueuedSnapJob, 'queuedAt' | 'attempts' | 'status' | 'revision' | 'delivery'>, operation?: SnapQueueOperation): Promise<void>;
  list(): Promise<QueuedSnapJob[]>;
  remove(jobId: string, operation?: SnapQueueOperation): Promise<boolean>;
  update(jobId: string, patch: QueuePatch, operation?: SnapQueueOperation): Promise<boolean>;
  /** Retry a job that previously failed permanently. */
  retryFailed(jobId: string, operation?: SnapQueueOperation): Promise<boolean>;
  /**
   * Deliver pending jobs in order. Stops at the first transient failure
   * (offline again); permanent failures are kept with status 'failed'.
   */
  flush(send: SnapQueueSender, operation?: SnapQueueOperation): Promise<void>;
  isFlushing(): boolean;
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

  const mutate = async (transform: (jobs: QueuedSnapJob[]) => QueuedSnapJob[], operation?: SnapQueueOperation) => {
    operation?.guard?.();
    await store.update(jobs => { operation?.guard?.(); return transform(jobs); });
    operation?.guard?.();
    emit();
  };
  const matches = (row: QueuedSnapJob, jobId: string, operation?: SnapQueueOperation) => row.jobId === jobId
    && (operation?.ownerUid === undefined || row.ownerUid === operation.ownerUid)
    && (!operation || !('expectedRevision' in operation) || row.revision === operation.expectedRevision);

  return {
    async enqueue(job, operation) {
      await mutate(jobs => {
        const existing = jobs.find(row => row.jobId === job.jobId);
        if (existing) {
          if (immutableIdentity(existing) !== immutableIdentity(job)) throw new Error('This queued snap belongs to another account or draft. Send the changed capture as a new snap.');
          // Retain the first immutable media/destination payload and any saved
          // progress. Re-enqueue must not reset a newer retry or active claim.
          return jobs;
        }
        if (operation?.ownerUid !== undefined && operation.ownerUid !== job.ownerUid) throw new Error('This snap belongs to another account.');
        return [...jobs, { ...job, revision: newRevision(), queuedAt: Date.now(), attempts: 0, status: 'pending' }];
      }, operation);
    },

    async list() {
      return store.read();
    },

    async remove(jobId, operation) {
      let removed = false;
      await mutate(jobs => jobs.filter(row => {
        if (!matches(row, jobId, operation)) return true;
        removed = true;
        return false;
      }), operation);
      return removed;
    },

    async update(jobId, patch, operation) {
      if (Object.keys(patch).some(key => !['status', 'lastError', 'attempts', 'remainingConversationIds', 'remainingStoryDestinationIds'].includes(key))) throw new Error('Snap ownership and capture data cannot be replaced.');
      let changed = false;
      await mutate(jobs => jobs.map(row => {
        if (!matches(row, jobId, operation)) return row;
        changed = true;
        return { ...row, ...patch, revision: newRevision(), delivery: undefined,
          ...(row.status === 'failed' && patch.status === 'pending' ? { attemptedStoryDestinationIds: [] } : {}),
        };
      }), operation);
      return changed;
    },

    async retryFailed(jobId, operation) {
      let changed = false;
      await mutate(jobs => jobs.map(row => {
        if (!matches(row, jobId, operation) || row.status !== 'failed') return row;
        changed = true;
        return { ...row, revision: newRevision(), delivery: undefined, status: 'pending', lastError: undefined, attemptedStoryDestinationIds: [] };
      }), operation);
      return changed;
    },

    async flush(send, operation) {
      if (flushing) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      flushing = true;
      try {
        const jobs = await store.read();
        operation?.guard?.();
        for (const snapshot of jobs) {
          // Unverifiable historical records are quarantined, never assigned to
          // whichever account happens to reconnect first.
          if (!snapshot.ownerUid && snapshot.status !== 'failed') {
            await mutate(current => current.map(row => row.jobId === snapshot.jobId && !row.ownerUid && row.revision === snapshot.revision
              ? { ...row, status: 'failed', revision: newRevision(), delivery: undefined, lastError: 'This older queued snap cannot be verified. Capture it again before sending.' } : row), operation);
            continue;
          }
          if (snapshot.status === 'failed' || !matches(snapshot, snapshot.jobId, operation)) continue;
          let job: QueuedSnapJob | undefined;
          const token = newRevision();
          await mutate(current => current.map(row => {
            if (!matches(row, snapshot.jobId, operation) || row.revision !== snapshot.revision || row.status !== 'pending') return row;
            if (row.delivery && row.delivery.expiresAt > Date.now()) return row;
            if (row.storyPublishVersion !== 1 && (row.attemptedStoryDestinationIds?.length || ((!row.revision || row.delivery) && row.remainingStoryDestinationIds.length))) {
              return { ...row, delivery: undefined, status: 'failed', revision: newRevision(), lastError: STORY_REVIEW_MESSAGE };
            }
            const claimed = { ...row, revision: token, delivery: { token, expiresAt: Date.now() + SNAP_QUEUE_DELIVERY_LEASE_MS } };
            job = { ...claimed };
            return claimed;
          }), operation);
          if (!job) continue;

          const checkpoint = async (change: (row: QueuedSnapJob) => QueuedSnapJob) => {
            let found = false;
            await mutate(current => current.map(row => {
              if (!matches(row, job!.jobId, operation) || row.delivery?.token !== token) return row;
              found = true;
              return { ...change(row), delivery: { token, expiresAt: Date.now() + SNAP_QUEUE_DELIVERY_LEASE_MS } };
            }), operation);
            if (!found) throw new Error('This saved snap changed while sending. Open its current retry state.');
          };
          const delivery: SnapQueueDelivery = {
            check: () => checkpoint(row => row),
            prepare: conversationIds => checkpoint(row => ({ ...row, draft: { ...row.draft, conversationIds: [...conversationIds], recipientIds: [] }, remainingConversationIds: [...conversationIds] })),
            uploaded: uploaded => checkpoint(row => ({ ...row, uploaded: { ...uploaded } })),
            beginStory: id => checkpoint(row => ({ ...row, attemptedStoryDestinationIds: [...new Set([...(row.attemptedStoryDestinationIds || []), id])] })),
            acknowledge: (kind, id) => checkpoint(row => ({ ...row,
              remainingConversationIds: kind === 'conversation' ? row.remainingConversationIds.filter(value => value !== id) : row.remainingConversationIds,
              remainingStoryDestinationIds: kind === 'story' ? row.remainingStoryDestinationIds.filter(value => value !== id) : row.remainingStoryDestinationIds,
              attemptedStoryDestinationIds: kind === 'story' ? row.attemptedStoryDestinationIds?.filter(value => value !== id) : row.attemptedStoryDestinationIds,
            })),
          };

          let result: SnapQueueSendResult;
          try {
            result = await send(job, delivery);
          } catch (err) {
            result = 'failed';
            job.lastError = err instanceof Error ? err.message : 'Failed to send';
          }

          await mutate(current => current.flatMap(row => {
            if (!matches(row, job!.jobId, operation) || row.delivery?.token !== token) return [row];
            if (result === 'sent') return [];
            if (row.storyPublishVersion !== 1 && row.attemptedStoryDestinationIds?.length) return [{ ...row, delivery: undefined, revision: newRevision(), status: 'failed', attempts: row.attempts + 1, lastError: STORY_REVIEW_MESSAGE }];
            if (result === 'skip_account' || result === 'retry_later') return [{ ...row, delivery: undefined }];
            return [{ ...row, delivery: undefined, revision: newRevision(), status: 'failed', attempts: row.attempts + 1, lastError: job!.lastError || row.lastError || 'Failed to send' }];
          }), operation);
          if (result === 'retry_later') break;
        }
      } finally {
        flushing = false;
      }
    },

    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    isFlushing: () => flushing,
  };
}
