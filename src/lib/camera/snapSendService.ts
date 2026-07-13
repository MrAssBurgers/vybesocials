/**
 * Snap send orchestrator — one draft, one upload, many destinations.
 *
 * Non-blocking: jobs run at module level so the user can leave the camera /
 * conversation while delivery continues. Progress is observable via
 * subscribeSnapJobs (rendered by SnapSendProgress).
 *
 * Delivery rules:
 * - DM destinations go through the callable-only `insertDmMessage` path with a
 *   deterministic per-conversation client_message_id (server idempotency).
 * - Story destinations create one story record per destination, reusing the
 *   single uploaded asset.
 * - Optimistic pending bubbles appear in each conversation immediately and are
 *   replaced (or marked failed) as results come in.
 * - When offline, the draft + media blob persist to IndexedDB and flush on
 *   reconnect ("Waiting for connection").
 */
import type { QueryClient } from '@tanstack/react-query';
import { insertDmMessage, bumpConversationUpdatedAt } from '@/lib/dmSendCore';
import { isTransientDmSendFailure, classifyDmSendError } from '@/lib/dmSendErrors';
import { createDmChat } from '@/lib/firebase/chats';
import { onReconnect } from '@/lib/reconnectManager';
import {
  patchMessagesCache,
  replaceOptimisticMessage,
} from '@/lib/messagesQueryKey';
import type { Message } from '@/hooks/useMessages';
import {
  clientMessageIdFor,
  optimisticTempIdFor,
  type SnapMediaDraft,
} from '@/lib/camera/snapDraft';
import {
  applyDestinationState,
  createDestinationStatuses,
  deriveJobPhase,
  destinationKey,
  failedDestinations,
  isTerminalPhase,
  resetFailedForRetry,
  type SnapDestinationStatus,
  type SnapJobPhase,
} from '@/lib/camera/snapSendStateMachine';
import { uploadSnapMedia, type SnapUploadResult } from '@/lib/camera/uploadSnapMedia';
import { createStoryRecord } from '@/lib/camera/createStoryRecord';
import type { StoryDestinationId } from '@/lib/camera/recipientSelection';
import {
  createIdbSnapQueueStore,
  createSnapOfflineQueue,
  type QueuedSnapJob,
} from '@/lib/camera/snapOfflineQueue';
import {
  isFailedDraftExpired,
  revokeDraftLocalUri,
} from '@/lib/camera/snapBlobCleanup';
import { isEphemeralViewMode } from '@/lib/camera/snapFlowBehavior';

export interface SnapSenderProfile {
  id: string;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface StartSnapSendParams {
  draft: SnapMediaDraft;
  file: File;
  /** Profile id used as message sender_id. */
  senderId: string;
  /** Auth uid — storage upload paths embed it. */
  authUserId: string;
  senderProfile?: SnapSenderProfile;
  caption?: string;
}

export interface SnapSendJobSnapshot {
  jobId: string;
  phase: SnapJobPhase;
  uploadProgress: number;
  destinations: SnapDestinationStatus[];
  mediaType: 'photo' | 'video';
  createdAt: number;
  error?: string;
}

interface SnapSendJob extends StartSnapSendParams {
  jobId: string;
  phase: SnapJobPhase;
  uploadProgress: number;
  destinations: SnapDestinationStatus[];
  uploaded?: SnapUploadResult;
  error?: string;
  createdAt: number;
}

const jobs = new Map<string, SnapSendJob>();
const listeners = new Set<() => void>();
let sharedQueryClient: QueryClient | null = null;
let queueStarted = false;

const offlineQueue = createSnapOfflineQueue(createIdbSnapQueueStore());

/** Register once from a component under QueryClientProvider (SnapSendProgress). */
export function registerSnapSendQueryClient(qc: QueryClient): void {
  sharedQueryClient = qc;
}

function emit(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeSnapJobs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapJobSnapshots(): SnapSendJobSnapshot[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      jobId: j.jobId,
      phase: j.phase,
      uploadProgress: j.uploadProgress,
      destinations: j.destinations,
      mediaType: j.draft.mediaType,
      createdAt: j.createdAt,
      error: j.error,
    }));
}

export function dismissSnapJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  if (!isTerminalPhase(job.phase) && job.phase !== 'waiting_for_connection') return;
  revokeDraftLocalUri(job.draft);
  jobs.delete(jobId);
  emit();
}

function updateJob(job: SnapSendJob, patch: Partial<SnapSendJob>): void {
  Object.assign(job, patch);
  emit();
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// ── Optimistic UI ────────────────────────────────────────────────────────────

function optimisticMessageFor(
  job: SnapSendJob,
  conversationId: string,
): Message & { _sending: boolean; _waitingForConnection?: boolean } {
  const tempId = optimisticTempIdFor(job.draft, conversationId);
  const waiting =
    job.phase === 'waiting_for_connection' && isEphemeralViewMode(job.draft.viewMode);
  return {
    id: tempId,
    conversation_id: conversationId,
    sender_id: job.senderId,
    content: null,
    media_url: job.draft.localUri,
    media_type: 'vybe',
    message_type: 'vybe',
    view_mode: job.draft.viewMode,
    expires_at: null,
    is_deleted: false,
    reply_to_id: job.draft.replyToMessageId ?? null,
    created_at: new Date().toISOString(),
    sender: job.senderProfile
      ? {
          id: job.senderProfile.id,
          username: job.senderProfile.username || '',
          avatar_url: job.senderProfile.avatar_url ?? null,
          display_name: job.senderProfile.display_name ?? null,
        }
      : undefined,
    views: [],
    reactions: [],
    _clientKey: tempId,
    _sending: true,
    ...(waiting ? { _waitingForConnection: true } : {}),
  };
}

function markBubblesWaitingForConnection(job: SnapSendJob): void {
  const qc = sharedQueryClient;
  if (!qc || !isEphemeralViewMode(job.draft.viewMode)) return;
  for (const conversationId of job.draft.conversationIds) {
    const tempId = optimisticTempIdFor(job.draft, conversationId);
    patchMessagesCache(qc, conversationId, (old) =>
      old?.map((m) =>
        m.id === tempId ? ({ ...m, _waitingForConnection: true } as Message) : m,
      ),
    );
  }
}

function insertOptimisticBubbles(job: SnapSendJob): void {
  const qc = sharedQueryClient;
  if (!qc) return;
  for (const conversationId of job.draft.conversationIds) {
    const temp = optimisticMessageFor(job, conversationId);
    patchMessagesCache(qc, conversationId, (old) => {
      if (old?.some((m) => m.id === temp.id)) return old;
      return [...(old ?? []), temp];
    });
  }
}

function markBubbleFailed(job: SnapSendJob, conversationId: string, error?: string): void {
  const qc = sharedQueryClient;
  if (!qc) return;
  const tempId = optimisticTempIdFor(job.draft, conversationId);
  patchMessagesCache(qc, conversationId, (old) =>
    old?.map((m) =>
      m.id === tempId
        ? ({ ...m, _sending: false, _failed: true, _error: error } as Message)
        : m,
    ),
  );
}

function removeBubble(job: SnapSendJob, conversationId: string): void {
  const qc = sharedQueryClient;
  if (!qc) return;
  const tempId = optimisticTempIdFor(job.draft, conversationId);
  patchMessagesCache(qc, conversationId, (old) => old?.filter((m) => m.id !== tempId));
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function deliverConversation(
  job: SnapSendJob,
  conversationId: string,
): Promise<{ ok: boolean; transient: boolean; error?: string }> {
  const key = destinationKey('conversation', conversationId);
  updateJob(job, {
    destinations: applyDestinationState(job.destinations, key, 'sending'),
  });

  const { data, error } = await insertDmMessage(
    {
      conversation_id: conversationId,
      sender_id: job.senderId,
      content: null,
      media_url: job.uploaded!.mediaUrl,
      media_type: 'vybe',
      message_type: 'vybe',
      view_mode: job.draft.viewMode,
      expires_at: null,
      client_message_id: clientMessageIdFor(job.draft, conversationId),
      reply_to_id: job.draft.replyToMessageId ?? null,
    },
    job.senderProfile?.username || job.senderProfile?.display_name
      ? {
          push: {
            senderName:
              job.senderProfile?.display_name || job.senderProfile?.username || 'VYBE',
            preview: '📸 New Snap',
          },
        }
      : undefined,
  );

  if (error || !data) {
    const message = error?.message || 'Failed to send';
    const transient = isTransientDmSendFailure(classifyDmSendError(error));
    updateJob(job, {
      destinations: applyDestinationState(job.destinations, key, 'failed', message),
    });
    markBubbleFailed(job, conversationId, message);
    return { ok: false, transient, error: message };
  }

  if (sharedQueryClient) {
    replaceOptimisticMessage(
      sharedQueryClient,
      conversationId,
      optimisticTempIdFor(job.draft, conversationId),
      data,
    );
  }
  void bumpConversationUpdatedAt(conversationId);
  updateJob(job, {
    destinations: applyDestinationState(job.destinations, key, 'sent'),
  });
  return { ok: true, transient: false };
}

async function deliverStory(
  job: SnapSendJob,
  destination: StoryDestinationId,
): Promise<{ ok: boolean; error?: string }> {
  const key = destinationKey('story', destination);
  updateJob(job, {
    destinations: applyDestinationState(job.destinations, key, 'sending'),
  });
  try {
    await createStoryRecord({
      mediaUrl: job.uploaded!.mediaUrl,
      mediaType: job.draft.mediaType,
      thumbnailUrl: job.uploaded!.thumbnailUrl,
      caption: job.caption,
      durationSec: job.draft.durationSec,
      destination,
    });
    updateJob(job, {
      destinations: applyDestinationState(job.destinations, key, 'sent'),
    });
    void sharedQueryClient?.invalidateQueries({ queryKey: ['stories'] });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to post story';
    updateJob(job, {
      destinations: applyDestinationState(job.destinations, key, 'failed', message),
    });
    return { ok: false, error: message };
  }
}

async function deliverPending(job: SnapSendJob, retrying = false): Promise<void> {
  updateJob(job, {
    phase: deriveJobPhase(job.destinations, { retrying }),
  });

  const pending = job.destinations.filter((d) => d.state === 'pending');
  await Promise.all(
    pending.map((d) =>
      d.kind === 'conversation'
        ? deliverConversation(job, d.id)
        : deliverStory(job, d.id as StoryDestinationId),
    ),
  );

  updateJob(job, { phase: deriveJobPhase(job.destinations) });

  if (job.phase === 'sent') {
    revokeDraftLocalUri(job.draft);
    // Keep the "Sent" state visible briefly, then clean up.
    setTimeout(() => {
      jobs.delete(job.jobId);
      emit();
    }, 4000);
  }
}

async function ensureConversations(job: SnapSendJob): Promise<void> {
  const missing = job.draft.recipientIds.filter((profileId) => !!profileId);
  if (!missing.length) return;
  const resolved: string[] = [];
  for (const profileId of missing) {
    try {
      const conversationId = await createDmChat(profileId);
      resolved.push(conversationId);
    } catch (err) {
      console.warn('[SnapSend] failed to open conversation for', profileId, err);
    }
  }
  const conversationIds = [
    ...new Set([...job.draft.conversationIds, ...resolved]),
  ];
  job.draft = { ...job.draft, conversationIds, recipientIds: [] };
}

async function enqueueOffline(job: SnapSendJob): Promise<void> {
  let mediaBlob: Blob | undefined;
  try {
    mediaBlob = job.file;
  } catch {
    mediaBlob = undefined;
  }
  await offlineQueue.enqueue({
    jobId: job.jobId,
    draft: job.draft,
    mediaBlob,
    mediaMimeType: job.file.type,
    remainingConversationIds: job.destinations
      .filter((d) => d.kind === 'conversation' && d.state !== 'sent')
      .map((d) => d.id),
    remainingStoryDestinationIds: job.destinations
      .filter((d) => d.kind === 'story' && d.state !== 'sent')
      .map((d) => d.id),
    senderId: job.senderId,
  });
  updateJob(job, { phase: 'waiting_for_connection' });
  markBubblesWaitingForConnection(job);
}

async function runJob(job: SnapSendJob): Promise<void> {
  try {
    updateJob(job, { phase: 'preparing' });
    await ensureConversations(job);
    updateJob(job, {
      destinations: createDestinationStatuses({
        conversationIds: job.draft.conversationIds,
        storyDestinationIds: job.draft.storyDestinationIds,
      }),
    });

    if (!job.destinations.length) {
      updateJob(job, { phase: 'failed', error: 'No destinations selected' });
      return;
    }

    insertOptimisticBubbles(job);

    if (isOffline()) {
      await enqueueOffline(job);
      return;
    }

    updateJob(job, { phase: 'uploading' });
    job.draft = { ...job.draft, uploadState: 'uploading' };
    let uploaded: SnapUploadResult;
    try {
      uploaded = await uploadSnapMedia({
        file: job.file,
        isVideo: job.draft.mediaType === 'video',
        authUserId: job.authUserId,
        onProgress: (fraction) => updateJob(job, { uploadProgress: fraction }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (isOffline()) {
        await enqueueOffline(job);
        return;
      }
      job.draft = { ...job.draft, uploadState: 'failed' };
      updateJob(job, { phase: 'failed', error: message });
      job.draft.conversationIds.forEach((cid) => markBubbleFailed(job, cid, message));
      return;
    }

    job.draft = { ...job.draft, uploadState: 'uploaded' };
    job.uploaded = uploaded;
    updateJob(job, { phase: 'processing', uploadProgress: 1 });

    await deliverPending(job);
  } catch (err) {
    console.error('[SnapSend] job crashed:', err);
    updateJob(job, {
      phase: 'failed',
      error: err instanceof Error ? err.message : 'Failed to send',
    });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startSnapSend(params: StartSnapSendParams): string {
  const job: SnapSendJob = {
    ...params,
    jobId: params.draft.mediaId,
    phase: 'preparing',
    uploadProgress: 0,
    destinations: [],
    createdAt: Date.now(),
  };
  jobs.set(job.jobId, job);
  emit();
  void runJob(job);
  return job.jobId;
}

/** Retry only the failed destinations of a job (reuses the uploaded asset). */
export function retrySnapJob(jobId: string): void {
  const job = jobs.get(jobId);
  if (!job) return;

  if (!job.uploaded) {
    // Upload itself failed — restart the whole job.
    updateJob(job, {
      phase: 'preparing',
      error: undefined,
      uploadProgress: 0,
      destinations: resetFailedForRetry(job.destinations),
    });
    void runJob(job);
    return;
  }

  if (!failedDestinations(job.destinations).length) return;
  updateJob(job, {
    destinations: resetFailedForRetry(job.destinations),
    error: undefined,
  });
  // Re-show pending bubbles for retried conversations.
  job.destinations
    .filter((d) => d.kind === 'conversation' && d.state === 'pending')
    .forEach((d) => {
      removeBubble(job, d.id);
    });
  insertOptimisticBubbles(job);
  void deliverPending(job, true);
}

// ── Offline queue flush ──────────────────────────────────────────────────────

async function flushQueuedJob(queued: QueuedSnapJob): Promise<'sent' | 'retry_later' | 'failed'> {
  if (isOffline()) return 'retry_later';

  const live = jobs.get(queued.jobId);
  if (!queued.mediaBlob) return 'failed';

  const file = new File(
    [queued.mediaBlob],
    queued.draft.mediaType === 'video' ? 'snap-video.webm' : 'snap-photo.jpg',
    { type: queued.mediaMimeType || queued.mediaBlob.type },
  );

  const job: SnapSendJob =
    live ??
    ({
      draft: {
        ...queued.draft,
        conversationIds: queued.remainingConversationIds,
        storyDestinationIds: queued.remainingStoryDestinationIds,
        recipientIds: [],
      },
      file,
      senderId: queued.senderId,
      authUserId: queued.senderId,
      jobId: queued.jobId,
      phase: 'preparing',
      uploadProgress: 0,
      destinations: [],
      createdAt: queued.queuedAt,
    } as SnapSendJob);

  if (!live) {
    // Resolve auth uid for the storage path at flush time.
    try {
      const { db } = await import('@/lib/firebase');
      const { data: { session } } = await db.auth.getSession();
      if (session?.user?.id) job.authUserId = session.user.id;
    } catch {
      /* fall back to senderId path */
    }
    jobs.set(job.jobId, job);
    emit();
  } else {
    job.file = file;
  }

  await runJob(job);

  if (job.phase === 'sent') return 'sent';
  if (job.phase === 'waiting_for_connection' || isOffline()) return 'retry_later';
  if (job.phase === 'partially_sent') {
    // Deliverable destinations went through; don't re-send them forever.
    return 'failed';
  }
  return 'failed';
}

/** Wire reconnect/online listeners for the offline snap queue. Idempotent. */
export function startSnapSendQueue(): void {
  if (queueStarted || typeof window === 'undefined') return;
  queueStarted = true;

  const flush = () => {
    void offlineQueue.flush(flushQueuedJob);
    void purgeExpiredFailedQueuedJobs();
  };

  flush();
  onReconnect(flush);
  window.addEventListener('online', flush);
  window.addEventListener('vybe:online', flush);
}

async function purgeExpiredFailedQueuedJobs(): Promise<void> {
  const queued = await offlineQueue.list();
  const now = Date.now();
  for (const job of queued) {
    if (job.status !== 'failed') continue;
    if (!isFailedDraftExpired(job.draft, now)) continue;
    revokeDraftLocalUri(job.draft);
    await offlineQueue.remove(job.jobId);
    jobs.delete(job.jobId);
    emit();
  }
}

export function getSnapOfflineQueue() {
  return offlineQueue;
}
