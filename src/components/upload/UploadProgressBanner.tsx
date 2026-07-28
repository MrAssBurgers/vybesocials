import { useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, X, AlertCircle, Upload, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import {
  subscribeUploadQueue,
  getUploadJobs,
  dismissUploadJob,
  retryUploadJob,
  type UploadJob,
} from '@/lib/uploadQueue';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STAGE_LABEL: Record<UploadJob['stage'], string> = {
  optimizing: 'Optimizing…',
  uploading: 'Uploading…',
  vybe_check: 'Checking safety…',
  publishing: 'Publishing…',
  done: 'Published!',
  failed: 'Couldn’t publish',
};

function JobRow({ job }: { job: UploadJob }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(job.stage === 'failed');
  const isActive = job.stage !== 'done' && job.stage !== 'failed';
  const canRetry = job.stage === 'failed' && !!job.input;

  return (
    <div className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          {job.stage === 'done' ? (
            <CheckCircle2 className="h-5 w-5 text-green-400" />
          ) : job.stage === 'failed' ? (
            <AlertCircle className="h-5 w-5 text-red-400" />
          ) : (
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{job.label}</p>
          <p
            className={cn(
              'text-xs truncate',
              job.stage === 'failed' ? 'text-red-400' : 'text-muted-foreground',
            )}
          >
            {job.stage === 'failed' ? (job.error ? 'Tap for details' : STAGE_LABEL.failed) : STAGE_LABEL[job.stage]}
          </p>
          {isActive && (
            <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${job.progress}%` }}
                transition={{ ease: 'easeOut', duration: 0.25 }}
              />
            </div>
          )}
        </div>
        {job.stage === 'failed' && job.error && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground"
            aria-label={expanded ? 'Hide details' : 'Show details'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => dismissUploadJob(job.id)}
          className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {job.stage === 'failed' && expanded && job.error && (
        <p className="mt-2 text-xs leading-relaxed text-red-300/90 pl-8 pr-2">{job.error}</p>
      )}

      {job.stage === 'failed' && (
        <div className="mt-2.5 flex items-center gap-2 pl-8">
          {canRetry && (
            <button
              type="button"
              onClick={() => {
                if (retryUploadJob(job.id)) {
                  toast.message('Retrying publish…');
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              dismissUploadJob(job.id);
              navigate('/upload');
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-foreground"
          >
            Edit post
          </button>
        </div>
      )}
    </div>
  );
}

export function UploadProgressBanner() {
  const jobs = useSyncExternalStore(subscribeUploadQueue, getUploadJobs, getUploadJobs);
  const visible = jobs.filter(
    (j) => j.stage !== 'done' || Date.now() - j.createdAt < 5000,
  );

  if (!visible.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        className="fixed inset-x-0 z-[9998] pointer-events-none"
        style={{ bottom: 'max(calc(var(--sab, 0px) + 4.5rem), 5.5rem)' }}
      >
        <div className="mx-3 pointer-events-auto rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/30">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Publishing
            </span>
          </div>
          {visible.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
