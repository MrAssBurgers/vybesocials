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
  type SnapQueueDelivery,
} from '@/lib/camera/snapOfflineQueue';
import {
  isFailedDraftExpired,
  revokeDraftLocalUri,
} from '@/lib/camera/snapBlobCleanup';
import { isEphemeralViewMode } from '@/lib/camera/snapFlowBehavior';
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe, isReportSessionError, type ReportAccountSession } from '@/lib/reportModerationService';
import { isMessageSessionCurrent } from '@/lib/messagesQueryKey';
import { doc, getDocFromServer } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';

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
  session: ReportAccountSession;
  guard: () => void;
  jobId: string;
  phase: SnapJobPhase;
  uploadProgress: number;
  destinations: SnapDestinationStatus[];
  uploaded?: SnapUploadResult;
  error?: string;
  createdAt: number;
  queued?: boolean;
  queueDelivery?: SnapQueueDelivery;
}

const jobs = new Map<string, SnapSendJob>();
const listeners = new Set<() => void>();
let sharedQueryClient: QueryClient | null = null;
let queueStarted = false;
let queueRecoveryTimer: ReturnType<typeof setTimeout> | undefined;

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
  const stopAccount = reportAccountSubscribe(cb);
  return () => { listeners.delete(cb); stopAccount(); };
}

export function getSnapJobSnapshots(): SnapSendJobSnapshot[] {
  return [...jobs.values()]
    .filter(job => isMessageSessionCurrent(job.session))
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
  if (!job || !isMessageSessionCurrent(job.session)) return;
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

async function verifySender(job: SnapSendJob): Promise<void> {
  job.guard();
  if (!job.senderId || job.senderId.includes('/') || job.authUserId !== job.session.uid) throw new Error('Open the camera again from your current account.');
  const profile = await getDocFromServer(doc(getFirestoreDb(), 'profiles', job.senderId));
  job.guard();
  if (!profile.exists() || profile.data().user_id !== job.authUserId) throw new Error('The snap sender could not be verified. Open the camera again.');
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
      job.session,
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
    }, job.session);
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
    job.session,
  );
}

function removeBubble(job: SnapSendJob, conversationId: string): void {
  const qc = sharedQueryClient;
  if (!qc) return;
  const tempId = optimisticTempIdFor(job.draft, conversationId);
  patchMessagesCache(qc, conversationId, (old) => old?.filter((m) => m.id !== tempId), job.session);
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function deliverConversation(
  job: SnapSendJob,
  conversationId: string,
): Promise<{ ok: boolean; transient: boolean; error?: string }> {
  job.guard();
  await job.queueDelivery?.check();
  job.guard();
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
    {
      accountGuard: job.guard,
      ...(job.senderProfile?.username || job.senderProfile?.display_name
      ? {
          push: {
            senderName:
              job.senderProfile?.display_name || job.senderProfile?.username || 'VYBE',
            preview: '📸 New Snap',
          },
        }
      : {}),
    },
  );
  job.guard();

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
      job.session,
    );
  }
  void bumpConversationUpdatedAt(conversationId);
  updateJob(job, {
    destinations: applyDestinationState(job.destinations, key, 'sent'),
  });
  await job.queueDelivery?.acknowledge('conversation', conversationId);
  job.guard();
  return { ok: true, transient: false };
}

async function deliverStory(
  job: SnapSendJob,
  destination: StoryDestinationId,
): Promise<{ ok: boolean; error?: string }> {
  job.guard();
  await job.queueDelivery?.check();
  job.guard();
  const key = destinationKey('story', destination);
  updateJob(job, {
    destinations: applyDestinationState(job.destinations, key, 'sending'),
  });
  try {
    await job.queueDelivery?.beginStory(destination);
    job.guard();
    await createStoryRecord({
      mediaUrl: job.uploaded!.mediaUrl,
      mediaType: job.draft.mediaType,
      thumbnailUrl: job.uploaded!.thumbnailUrl,
      caption: job.caption,
      durationSec: job.draft.durationSec,
      destination,
      authorId: job.senderId,
      accountGuard: job.guard,
    });
    job.guard();
    updateJob(job, {
      destinations: applyDestinationState(job.destinations, key, 'sent'),
    });
    await job.queueDelivery?.acknowledge('story', destination);
    job.guard();
    void sharedQueryClient?.invalidateQueries({ queryKey: ['stories'] });
    return { ok: true };
  } catch (err) {
    if (isReportSessionError(err)) throw err;
    // A local receipt failure cannot turn a confirmed story into a failed
    // destination that a same-page retry would publish again.
    if (job.destinations.some(d => d.key === key && d.state === 'sent')) throw err;
    const message = err instanceof Error ? err.message : 'Failed to post story';
    updateJob(job, {
      destinations: applyDestinationState(job.destinations, key, 'failed', message),
    });
    return { ok: false, error: message };
  }
}

async function deliverPending(job: SnapSendJob, retrying = false): Promise<void> {
  job.guard();
  updateJob(job, {
    phase: deriveJobPhase(job.destinations, { retrying }),
  });

  const pending = job.destinations.filter((d) => d.state === 'pending');
  const deliveries = await Promise.allSettled(
    pending.map((d) =>
      d.kind === 'conversation'
        ? deliverConversation(job, d.id)
        : deliverStory(job, d.id as StoryDestinationId),
    ),
  );
  job.guard();
  const rejected = deliveries.find(result => result.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;

  updateJob(job, { phase: deriveJobPhase(job.destinations) });

  if (job.phase === 'sent') {
    revokeDraftLocalUri(job.draft);
    // Keep the "Sent" state visible briefly, then clean up.
    setTimeout(() => {
      if (jobs.get(job.jobId) === job) jobs.delete(job.jobId);
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
      job.guard();
      const conversationId = await createDmChat(profileId, job.guard);
      job.guard();
      resolved.push(conversationId);
    } catch (err) {
      if (isReportSessionError(err)) throw err;
      throw new Error('Could not open every selected conversation. Your snap has not been sent. Try again.');
    }
  }
  const conversationIds = [
    ...new Set([...job.draft.conversationIds, ...resolved]),
  ];
  job.draft = { ...job.draft, conversationIds, recipientIds: [] };
}

async function enqueueOffline(job: SnapSendJob): Promise<void> {
  job.guard();
  let mediaBlob: Blob | undefined;
  try {
    mediaBlob = job.file;
  } catch {
    mediaBlob = undefined;
  }
  await offlineQueue.enqueue({
    schemaVersion: 2,
    ownerUid: job.authUserId,
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
    caption: job.caption,
  }, { ownerUid: job.authUserId, guard: job.guard });
  job.guard();
  updateJob(job, { phase: 'waiting_for_connection', queued: true });
  markBubblesWaitingForConnection(job);
}

async function runJob(job: SnapSendJob): Promise<void> {
  try {
    job.guard();
    updateJob(job, { phase: 'preparing' });
    if (isOffline()) {
      updateJob(job, { destinations: createDestinationStatuses(job.draft) });
      insertOptimisticBubbles(job);
      await enqueueOffline(job);
      return;
    }
    await verifySender(job);
    await job.queueDelivery?.check();
    job.guard();
    await ensureConversations(job);
    job.guard();
    await job.queueDelivery?.prepare(job.draft.conversationIds);
    job.guard();
    updateJob(job, {
      destinations: createDestinationStatuses({
        conversationIds: job.draft.conversationIds,
        storyDestinationIds: job.draft.storyDestinationIds,
      }),
    });

    if (!job.destinations.length) {
      // All destinations can already be acknowledged when a tab closed before
      // removing the finished queue row. No upload or send is needed again.
      updateJob(job, job.queued ? { phase: 'sent' } : { phase: 'failed', error: 'No destinations selected' });
      return;
    }

    insertOptimisticBubbles(job);

    if (isOffline()) {
      await enqueueOffline(job);
      return;
    }

    if (job.uploaded) {
      await deliverPending(job);
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
        accountGuard: job.guard,
        onProgress: (fraction) => { if (isMessageSessionCurrent(job.session)) updateJob(job, { uploadProgress: fraction }); },
      });
    } catch (err) {
      if (isReportSessionError(err)) throw err;
      job.guard();
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

    job.guard();
    job.draft = { ...job.draft, uploadState: 'uploaded' };
    job.uploaded = uploaded;
    await job.queueDelivery?.uploaded(uploaded);
    job.guard();
    updateJob(job, { phase: 'processing', uploadProgress: 1 });

    await deliverPending(job);
  } catch (err) {
    if (!isReportSessionError(err)) console.error('[SnapSend] job failed:', err);
    if (!isMessageSessionCurrent(job.session)) return;
    const message = err instanceof Error ? err.message : 'Failed to send';
    updateJob(job, {
      phase: 'failed',
      error: message,
    });
    job.destinations.filter(d => d.kind === 'conversation' && d.state !== 'sent').forEach(d => markBubbleFailed(job, d.id, message));
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function startSnapSend(params: StartSnapSendParams): string {
  const session = reportAccountSnapshot();
  const guard = reportAccountGuard(params.authUserId);
  guard();
  const job: SnapSendJob = {
    ...params,
    session,
    guard,
    jobId: `snap:${encodeURIComponent(params.authUserId)}:${params.draft.mediaId}`,
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
  if (!job || !isMessageSessionCurrent(job.session)) return;
  if (job.phase !== 'failed' && job.phase !== 'partially_sent') return;
  job.guard();

  if (job.queued) {
    updateJob(job, { phase: 'retrying', error: undefined });
    void retryQueuedJob(job);
    return;
  }

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
  void deliverPending(job, true).catch(error => {
    updateJob(job, { phase: 'failed', error: error instanceof Error ? error.message : 'Retry failed' });
  });
}

// ── Offline queue flush ──────────────────────────────────────────────────────

async function flushQueuedJob(queued: QueuedSnapJob, queueDelivery: SnapQueueDelivery): Promise<'sent' | 'retry_later' | 'failed' | 'skip_account'> {
  if (isOffline()) return 'retry_later';

  if (queued.schemaVersion !== 2 || !queued.ownerUid || !queued.senderId) {
    queued.lastError = 'This older queued snap cannot be verified. Capture it again before sending.';
    return 'failed';
  }
  const session = reportAccountSnapshot();
  if (session.uid !== queued.ownerUid) return 'skip_account';
  const guard = reportAccountGuard(queued.ownerUid);

  const existing = jobs.get(queued.jobId);
  // Durable records already bind the original owner. Restore that owner's
  // work into a new verified session; never revive the previous live guard.
  const live = existing && isMessageSessionCurrent(existing.session) ? existing : undefined;
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
        recipientIds: queued.draft.recipientIds,
      },
      file,
      senderId: queued.senderId,
      authUserId: queued.ownerUid,
      caption: queued.caption,
      session,
      guard,
      jobId: queued.jobId,
      phase: 'preparing',
      uploadProgress: 0,
      destinations: [],
      createdAt: queued.queuedAt,
    } as SnapSendJob);

  job.draft = { ...queued.draft, conversationIds: [...queued.remainingConversationIds], storyDestinationIds: [...queued.remainingStoryDestinationIds] };
  job.queued = true;
  job.queueDelivery = queueDelivery;
  job.uploaded = queued.uploaded;
  job.error = undefined;
  if (!live) {
    jobs.set(job.jobId, job);
    emit();
  } else {
    job.file = file;
  }

  await runJob(job);
  job.queueDelivery = undefined;

  if (!isMessageSessionCurrent(job.session)) return 'skip_account';

  if (job.phase === 'sent') return 'sent';
  if (job.phase === 'waiting_for_connection' || isOffline()) return 'retry_later';
  queued.lastError = job.error || job.destinations.find(d => d.state === 'failed')?.error;
  if (job.phase === 'partially_sent') {
    // Deliverable destinations went through; don't re-send them forever.
    return 'failed';
  }
  return 'failed';
}

async function retryQueuedJob(job: SnapSendJob): Promise<void> {
  try {
    const row = (await offlineQueue.list()).find(row => row.jobId === job.jobId && row.ownerUid === job.authUserId);
    job.guard();
    if (!row) throw new Error('This saved snap is no longer available. Capture it again.');
    if (row.delivery) throw new Error('This snap is still being recovered. Try again after its current send finishes.');
    // Retain receipts known in this live page if the storage acknowledgement
    // failed. A restored page can only rely on receipts actually committed.
    const sent = new Set(job.destinations.filter(d => d.state === 'sent').map(d => d.key));
    const changed = await offlineQueue.update(job.jobId, {
      remainingConversationIds: row.remainingConversationIds.filter(id => !sent.has(destinationKey('conversation', id))),
      remainingStoryDestinationIds: row.remainingStoryDestinationIds.filter(id => !sent.has(destinationKey('story', id))),
      status: 'pending', lastError: undefined,
    }, { ownerUid: job.authUserId, guard: job.guard, expectedRevision: row.revision });
    job.guard();
    if (!changed) throw new Error('This snap changed in another window. Reopen its current retry state.');
    await offlineQueue.flush(flushQueuedJob, { ownerUid: job.authUserId, guard: job.guard });
    job.guard();
    await restoreFailedQueuedJobs();
  } catch (error) {
    if (!isMessageSessionCurrent(job.session)) return;
    updateJob(job, { phase: 'failed', error: error instanceof Error ? error.message : 'Could not retry the saved snap.' });
  }
}

async function restoreFailedQueuedJobs(): Promise<void> {
  const session = reportAccountSnapshot();
  if (!session.uid) return;
  const queued = await offlineQueue.list();
  if (!isMessageSessionCurrent(session)) return;
  for (const row of queued) {
    if (row.ownerUid !== session.uid || row.schemaVersion !== 2 || row.status !== 'failed' || !row.mediaBlob) continue;
    const existing = jobs.get(row.jobId);
    if (existing) {
      if (isMessageSessionCurrent(existing.session) && !existing.queueDelivery) updateJob(existing, { phase: existing.phase === 'partially_sent' ? existing.phase : 'failed', error: row.lastError });
      if (isMessageSessionCurrent(existing.session)) continue;
    }
    const draft = { ...row.draft, conversationIds: [...row.remainingConversationIds], storyDestinationIds: [...row.remainingStoryDestinationIds] };
    jobs.set(row.jobId, {
      jobId: row.jobId, session, guard: reportAccountGuard(session.uid), authUserId: session.uid, senderId: row.senderId,
      draft, file: new File([row.mediaBlob], 'saved-snap', { type: row.mediaMimeType || row.mediaBlob.type }), caption: row.caption,
      phase: 'failed', queued: true, uploaded: row.uploaded, uploadProgress: 0, createdAt: row.queuedAt, error: row.lastError,
      destinations: createDestinationStatuses(draft).map(d => ({ ...d, state: 'failed', error: row.lastError })),
    });
  }
  emit();
}

/** Wire reconnect/online listeners for the offline snap queue. Idempotent. */
export function startSnapSendQueue(): void {
  if (queueStarted || typeof window === 'undefined') return;
  queueStarted = true;

  const flush = () => {
    clearTimeout(queueRecoveryTimer);
    const session = reportAccountSnapshot();
    if (!session.uid) return;
    const guard = reportAccountGuard(session.uid);
    void (async () => {
      await purgeExpiredFailedQueuedJobs();
      guard();
      await offlineQueue.flush(flushQueuedJob, { ownerUid: session.uid, guard });
      guard();
      await restoreFailedQueuedJobs();
      const rows = await offlineQueue.list();
      guard();
      const claims = rows.filter(row => row.ownerUid === session.uid && row.status === 'pending' && row.delivery);
      if (claims.length && !isOffline() && !offlineQueue.isFlushing()) {
        const nextExpiry = Math.min(...claims.map(row => row.delivery!.expiresAt));
        // One bounded wake-up, no polling loop or bypass of an active lease.
        queueRecoveryTimer = setTimeout(flush, Math.max(1000, Math.min(10 * 60_000, nextExpiry - Date.now() + 50)));
      }
    })().catch(error => {
      if (isReportSessionError(error)) return;
      console.error('[SnapSend] saved queue unavailable:', error);
    }).finally(() => {
      if (!isMessageSessionCurrent(session)) queueMicrotask(flush);
    });
  };

  flush();
  onReconnect(flush);
  reportAccountSubscribe(() => { emit(); flush(); });
  window.addEventListener('online', flush);
  window.addEventListener('vybe:online', flush);
}

async function purgeExpiredFailedQueuedJobs(): Promise<void> {
  const session = reportAccountSnapshot();
  if (!session.uid) return;
  const queued = await offlineQueue.list();
  if (!isMessageSessionCurrent(session)) return;
  const now = Date.now();
  for (const job of queued) {
    if (job.ownerUid !== session.uid) continue;
    if (!isMessageSessionCurrent(session)) return;
    if (job.status !== 'failed') continue;
    if (!isFailedDraftExpired(job.draft, now)) continue;
    const removed = await offlineQueue.remove(job.jobId, { ownerUid: session.uid, guard: reportAccountGuard(session.uid), expectedRevision: job.revision });
    if (!removed || !isMessageSessionCurrent(session)) continue;
    revokeDraftLocalUri(job.draft);
    jobs.delete(job.jobId);
    emit();
  }
}

export function getSnapOfflineQueue() {
  return offlineQueue;
}
