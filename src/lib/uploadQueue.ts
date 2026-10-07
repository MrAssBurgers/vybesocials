/** Account-bound background publishing, with explicit retry of retained receipts. */
import type { PostUploadInput, PostUploadStage } from '@/lib/postUploadPipeline';
import { listPreparedPosts } from './postCreateAttempts';
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe } from './reportModerationService';

export interface UploadJob {
  id: string; label: string; stage: PostUploadStage; progress: number; error?: string; postId?: string;
  createdAt: number; ownerUid: string; epoch: number; input?: PostUploadInput;
}
let jobs: UploadJob[] = [], visible: UploadJob[] = [];
let visibleKey = '', visibleSource: UploadJob[] | undefined;
const listeners = new Set<() => void>(), dismissed = new Set<string>();
const runs = new Map<string, symbol>();
function refreshVisible() {
  const session = reportAccountSnapshot(), key = (session.uid || '') + ':' + session.epoch;
  if (visibleKey === key && visibleSource === jobs) return;
  if (session.uid && visibleKey !== key) {
    const pending = listPreparedPosts(session.uid).filter(row => !dismissed.has(row.postId) && !jobs.some(job => job.ownerUid === session.uid && job.input?.clientPostId === row.postId));
    jobs = [...jobs, ...pending.map(row => ({ id: 'recovery-' + row.postId, label: 'Pending publication', stage: 'failed' as const, progress: 0,
      error: 'The previous publish result was not confirmed. Retry checks the same publication without changing its content.',
      createdAt: row.preparedAt, ownerUid: row.actor.uid, epoch: session.epoch,
      input: { profile: { id: row.actor.profileId, user_id: row.actor.uid }, clientPostId: row.postId, caption: row.payload.caption,
        tags: row.payload.tags, type: row.payload.type, visibility: row.payload.visibility, ...(row.payload.gameCaptureId ? { gameCaptureId: row.payload.gameCaptureId } : {}) } }))];
  }
  jobs = jobs.map(job => job.ownerUid === session.uid && job.epoch !== session.epoch && job.stage !== 'done'
    ? { ...job, stage: 'failed', progress: 0, error: 'Your account session changed. Retry deliberately to check this original publication.' } : job);
  visible = session.uid ? jobs.filter(job => job.ownerUid === session.uid) : [];
  visibleSource = jobs; visibleKey = key;
}
function notify() { visibleSource = undefined; refreshVisible(); for (const listener of listeners) listener(); }
let unsubscribeAccount: (() => void) | undefined;
export function subscribeUploadQueue(listener: () => void) {
  listeners.add(listener);
  if (!unsubscribeAccount) unsubscribeAccount = reportAccountSubscribe(notify);
  return () => { listeners.delete(listener); if (!listeners.size) { unsubscribeAccount?.(); unsubscribeAccount = undefined; } };
}
export function getUploadJobs() { refreshVisible(); return visible; }
export function getActiveUploadJob() { return getUploadJobs().find(job => job.stage !== 'done' && job.stage !== 'failed') ?? null; }
function updateJob(id: string, patch: Partial<UploadJob>) { jobs = jobs.map(job => job.id === id ? { ...job, ...patch } : job); notify(); }
export function dismissUploadJob(id: string) {
  const job = getUploadJobs().find(job => job.id === id); if (!job) return;
  if (job.input?.clientPostId) dismissed.add(job.input.clientPostId);
  runs.delete(id);
  jobs = jobs.filter(row => row.id !== id); notify();
}
function runJob(id: string, input: PostUploadInput) {
  const accountEpoch = reportAccountSnapshot().epoch;
  const accountGuard = reportAccountGuard(input.profile.user_id), run = Symbol(id);
  runs.set(id, run);
  const guard = () => { accountGuard(); if (runs.get(id) !== run) throw new Error('This upload attempt ended.'); };
  void (async () => {
    try {
      guard();
      const { runPostUpload } = await import('@/lib/postUploadPipeline'); guard();
      const result = await runPostUpload(input, (stage, progress) => { guard(); updateJob(id, { stage, progress, error: undefined }); }, guard);
      guard();
      if ('failed' in result) {
        updateJob(id, { stage: 'failed', progress: 0, error: result.reason });
        window.dispatchEvent(new CustomEvent('vybe:upload-failed', { detail: { id, reason: result.reason, ownerUid: input.profile.user_id, accountEpoch } })); return;
      }
      updateJob(id, { stage: 'done', progress: 100, postId: result.postId, input: undefined });
      window.dispatchEvent(new CustomEvent('vybe:upload-complete', { detail: { id, postId: result.postId, ownerUid: input.profile.user_id, accountEpoch } }));
      setTimeout(() => { try { guard(); dismissUploadJob(id); } catch { /* Retired owner. */ } }, 6000);
    } catch (error) {
      // Retain the original draft for its owner without painting another account.
      if (runs.get(id) !== run) return;
      const accountChanged = !!error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === 'account-changed';
      updateJob(id, { stage: 'failed', progress: 0, error: accountChanged
        ? 'Your account changed. Retry this original publication after signing back in.'
        : error instanceof Error && error.message ? error.message : 'Publishing could not be confirmed. Retry the same draft.' });
    }
  })();
}
export function enqueuePostUpload(input: PostUploadInput, label = 'New post'): string {
  const session = reportAccountSnapshot(); reportAccountGuard(input.profile.user_id)();
  const id = crypto.randomUUID(), stableInput = { ...input, profile: { ...input.profile }, tags: [...input.tags],
    ...(input.mediaFiles ? { mediaFiles: [...input.mediaFiles] } : {}), clientPostId: input.clientPostId || crypto.randomUUID() };
  if (jobs.filter(job => job.ownerUid === session.uid && job.stage !== 'done').length >= 8) throw new Error('Finish or dismiss a pending upload before starting another.');
  const job: UploadJob = { id, label, stage: 'optimizing', progress: 0, createdAt: Date.now(), input: stableInput, ownerUid: input.profile.user_id, epoch: session.epoch };
  jobs = [job, ...jobs]; notify(); runJob(id, stableInput); return id;
}
export function retryUploadJob(id: string): boolean {
  const job = getUploadJobs().find(row => row.id === id);
  if (!job?.input || job.stage !== 'failed') return false;
  try { reportAccountGuard(job.ownerUid)(); } catch { return false; }
  updateJob(id, { stage: 'optimizing', progress: 0, error: undefined, createdAt: Date.now(), epoch: reportAccountSnapshot().epoch });
  runJob(id, job.input); return true;
}
