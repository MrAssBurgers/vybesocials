/**
 * Global background upload queue — TikTok/YouTube-style publish progress.
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

export function enqueuePostUpload(input: PostUploadInput, label = 'New post'): string {
  const id = crypto.randomUUID();
  const job: UploadJob = {
    id,
    label,
    stage: 'vybe_check',
    progress: 0,
    createdAt: Date.now(),
  };
  jobs = [job, ...jobs].slice(0, 8);
  notify();

  void (async () => {
    const result = await runPostUpload(input, (stage, progress) => {
      updateJob(id, { stage, progress });
    });

    if ('failed' in result) {
      updateJob(id, { stage: 'failed', progress: 0, error: result.reason });
      window.dispatchEvent(
        new CustomEvent('vybe:upload-failed', { detail: { id, reason: result.reason } }),
      );
      return;
    }

    updateJob(id, { stage: 'done', progress: 100, postId: result.postId });
    window.dispatchEvent(
      new CustomEvent('vybe:upload-complete', { detail: { id, postId: result.postId } }),
    );

    setTimeout(() => dismissUploadJob(id), 6000);
  })();

  return id;
}
