/**
 * Shared report reason picker — replaces window.prompt() for App Review discoverability.
 */
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export const REPORT_REASON_OPTIONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'inappropriate', label: 'Inappropriate content' },
  { id: 'hate', label: 'Hate or violence' },
  { id: 'other', label: 'Other' },
] as const;

type ReportContentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: (reason: string) => Promise<void> | void;
};

export function ReportContentDialog({
  open,
  onOpenChange,
  title,
  description = 'Why are you reporting this?',
  onSubmit,
}: ReportContentDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFailed, setSubmitFailed] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setIsSubmitting(true);
    setSubmitFailed(false);
    triggerHaptic('medium');
    try {
      await onSubmit(selectedReason);
      setSelectedReason(null);
      onOpenChange(false);
    } catch {
      // A rejected write is retryable. Keep the selected reason and dialog open
      // instead of dropping the report or leaking an unhandled event promise.
      setSubmitFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) { setSelectedReason(null); setSubmitFailed(false); }
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-1 gap-2 py-2">
          {REPORT_REASON_OPTIONS.map((reason) => (
            <button
              key={reason.id}
              type="button"
              aria-pressed={selectedReason === reason.id}
              onClick={() => {
                triggerHaptic('light');
                setSelectedReason(reason.id);
                setSubmitFailed(false);
              }}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                selectedReason === reason.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border/50 hover:bg-muted/50',
              )}
            >
              {reason.label}
            </button>
          ))}
        </div>

        {submitFailed && <p role="alert" className="text-sm text-destructive">Couldn’t submit your report. Your reason is still selected. Try again.</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? 'Submitting…' : 'Submit Report'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
