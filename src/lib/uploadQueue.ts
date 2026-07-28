/**
 * Global background upload queue — leave-immediately publish with banner progress.
 */
import { runPostUpload, type PostUploadInput, type PostUploadStage } from '@/lib/postUploadPipeline';

export interface UploadJob {
  id: string;
  label: string;
  stage: PostUploadStage;
  progress: number;
  error?: string;
  postId?: string;
  createdAt: number;
  /** Retained for Retry after failure */
  input?: PostUploadInput;
}

type Listener = () => void;

let jobs: UploadJob[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUploadJobs(): UploadJob[] {
  return jobs;
}

export function getActiveUploadJob(): UploadJob | null {
  return jobs.find((j) => j.stage !== 'done' && j.stage !== 'failed') ?? null;
}

function updateJob(id: string, patch: Partial<UploadJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  notify();
}

export function dismissUploadJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  notify();
}

function runJob(id: string, input: PostUploadInput) {
  void (async () => {
    const result = await runPostUpload(input, (stage, progress) => {
      updateJob(id, { stage, progress, error: undefined });
    });

    if ('failed' in result) {
      updateJob(id, { stage: 'failed', progress: 0, error: result.reason });
      window.dispatchEvent(
        new CustomEvent('vybe:upload-failed', { detail: { id, reason: result.reason } }),
      );
      return;
    }

    updateJob(id, { stage: 'done', progress: 100, postId: result.postId, input: undefined });
    window.dispatchEvent(
      new CustomEvent('vybe:upload-complete', { detail: { id, postId: result.postId } }),
    );

    setTimeout(() => dismissUploadJob(id), 6000);
  })();
}

export function enqueuePostUpload(input: PostUploadInput, label = 'New post'): string {
  const id = crypto.randomUUID();
  const stableInput: PostUploadInput = {
    ...input,
    clientPostId: input.clientPostId || crypto.randomUUID(),
  };
  const job: UploadJob = {
    id,
    label,
    stage: 'optimizing',
    progress: 0,
    createdAt: Date.now(),
    input: stableInput,
  };
  jobs = [job, ...jobs].slice(0, 8);
  notify();
  runJob(id, stableInput);
  return id;
}

/** Re-run a failed job with the same payload. */
export function retryUploadJob(id: string): boolean {
  const job = jobs.find((j) => j.id === id);
  if (!job?.input || job.stage !== 'failed') return false;
  updateJob(id, {
    stage: 'optimizing',
    progress: 0,
    error: undefined,
    createdAt: Date.now(),
  });
  runJob(id, job.input);
  return true;
}
