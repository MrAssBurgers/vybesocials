import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Monitor, ChevronRight } from 'lucide-react';
import type { CaptureAlertPayload, CaptureSeverity } from '@/lib/ScreenshotDetectionService';
import { CaptureDetailsSheet } from './CaptureDetailsSheet';
import { cn } from '@/lib/utils';

interface CaptureAlertPopupProps {
  alerts: CaptureAlertPayload[];
  onDismiss?: (alert: CaptureAlertPayload) => void;
}

function severityStyles(severity: CaptureSeverity) {
  switch (severity) {
    case 'high':
      return 'border-destructive/40 bg-destructive/15 text-destructive';
    case 'medium':
      return 'border-primary/35 bg-primary/12 text-foreground';
    default:
      return 'border-border/40 bg-muted/60 text-muted-foreground';
  }
}

function labelForType(type: CaptureAlertPayload['eventType']): string {
  switch (type) {
    case 'screenshot_disappearing_photo':
      return 'Screenshot of disappearing photo';
    case 'screenshot_disappearing_video':
      return 'Screenshot of disappearing video';
    case 'screen_record_start':
      return 'Screen recording detected';
    case 'screen_record_stop':
      return 'Screen recording stopped';
    case 'screenshot_profile':
      return 'Profile screenshot';
    case 'screenshot_story':
      return 'Story screenshot';
    default:
      return 'Screenshot in chat';
  }
}

export function CaptureAlertPopup({ alerts, onDismiss }: CaptureAlertPopupProps) {
  const [visible, setVisible] = useState<CaptureAlertPayload[]>([]);
  const [details, setDetails] = useState<CaptureAlertPayload | null>(null);

  useEffect(() => {
    if (!alerts.length) return;
    setVisible((prev) => {
      const keys = new Set(prev.map((a) => `${a.eventType}:${a.timestamp}`));
      const next = [...prev];
      for (const a of alerts) {
        const k = `${a.eventType}:${a.timestamp}`;
        if (!keys.has(k)) next.push(a);
      }
      return next.slice(-3);
    });
  }, [alerts]);

  useEffect(() => {
    if (!visible.length) return;
    const timer = window.setTimeout(() => {
      const [first, ...rest] = visible;
      if (first) onDismiss?.(first);
      setVisible(rest);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [visible, onDismiss]);

  const top = visible[visible.length - 1];
  if (!top) return null;

  const isRecording = top.eventType === 'screen_record_start';

  return (
    <>
      <AnimatePresence>
        <motion.div
          key={`${top.eventType}-${top.timestamp}`}
          initial={{ opacity: 0, y: -12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          className="fixed top-[calc(var(--app-header-safe,env(safe-area-inset-top))+0.75rem)] left-1/2 -translate-x-1/2 z-[120] w-[min(92vw,360px)]"
        >
          <button
            type="button"
            onClick={() => setDetails(top)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-lg text-left',
              severityStyles(top.severity),
            )}
          >
            <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-background/40">
              {isRecording ? <Monitor className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold truncate">{labelForType(top.eventType)}</span>
              <span className="block text-xs opacity-80 truncate">
                {top.capturedByDisplayName || 'Someone'} · {top.confidence} confidence
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </motion.div>
      </AnimatePresence>
      <CaptureDetailsSheet open={!!details} alert={details} onOpenChange={(o) => !o && setDetails(null)} />
    </>
  );
}
