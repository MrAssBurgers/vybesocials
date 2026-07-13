/**
 * Non-blocking snap send progress — floats above the app while uploads/sends
 * continue in the background, with per-destination failure + retry-failed-only.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, Loader2, RefreshCw, WifiOff, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  dismissSnapJob,
  getSnapJobSnapshots,
  registerSnapSendQueryClient,
  retrySnapJob,
  startSnapSendQueue,
  subscribeSnapJobs,
  type SnapSendJobSnapshot,
} from '@/lib/camera/snapSendService';
import {
  failedDestinations,
  isTerminalPhase,
  phaseLabel,
} from '@/lib/camera/snapSendStateMachine';
import { shouldShowRetryFailedOnly } from '@/lib/camera/snapFlowBehavior';

function JobRow({ job, reducedMotion }: { job: SnapSendJobSnapshot; reducedMotion: boolean }) {
  const failed = failedDestinations(job.destinations);
  const sentCount = job.destinations.filter((d) => d.state === 'sent').length;
  const total = job.destinations.length;
  const terminal = isTerminalPhase(job.phase);
  const isError = job.phase === 'failed' || job.phase === 'partially_sent';
  const offline = job.phase === 'waiting_for_connection';
  const showRetry = shouldShowRetryFailedOnly(job.phase, job.destinations);

  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      exit={reducedMotion ? undefined : { opacity: 0, y: 16 }}
      transition={{ duration: reducedMotion ? 0 : 0.22 }}
      className="pointer-events-auto w-[min(92vw,22rem)] rounded-2xl border border-border/40 bg-background/90 p-3 shadow-lg backdrop-blur-xl"
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            job.phase === 'sent' && 'bg-primary/15 text-primary',
            isError && 'bg-destructive/15 text-destructive',
            offline && 'bg-muted text-muted-foreground',
            !terminal && !offline && 'bg-primary/10 text-primary',
          )}
        >
          {job.phase === 'sent' ? (
            <Check className="h-4 w-4" />
          ) : isError ? (
            <AlertTriangle className="h-4 w-4" />
          ) : offline ? (
            <WifiOff className="h-4 w-4" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">
            {phaseLabel(job.phase)}
            {total > 1 && ` · ${sentCount}/${total}`}
          </span>
          {job.error && (
            <span className="block truncate text-[10px] text-destructive">{job.error}</span>
          )}
          {!job.error && failed.length > 0 && (
            <span className="block truncate text-[10px] text-destructive">
              {failed.length} destination{failed.length === 1 ? '' : 's'} failed
            </span>
          )}
        </span>
        {showRetry && (
          <button
            type="button"
            aria-label="Retry failed"
            onClick={() => retrySnapJob(job.jobId)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary hover:bg-primary/25"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        {(terminal || offline) && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissSnapJob(job.jobId)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {(job.phase === 'uploading' || job.phase === 'processing') && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.max(6, Math.round(job.uploadProgress * 100))}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}

export function SnapSendProgress() {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<SnapSendJobSnapshot[]>([]);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    registerSnapSendQueryClient(queryClient);
    startSnapSendQueue();
    setJobs(getSnapJobSnapshots());
    return subscribeSnapJobs(() => setJobs(getSnapJobSnapshots()));
  }, [queryClient]);

  if (!jobs.length) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[6300] flex -translate-x-1/2 flex-col gap-2"
      style={{ bottom: 'calc(var(--sab, 0px) + 5.25rem)' }}
      aria-live="polite"
    >
      <AnimatePresence>
        {jobs.slice(0, 3).map((job) => (
          <JobRow key={job.jobId} job={job} reducedMotion={!!reducedMotion} />
        ))}
      </AnimatePresence>
    </div>
  );
}
