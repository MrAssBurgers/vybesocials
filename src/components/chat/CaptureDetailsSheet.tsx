import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { CaptureAlertPayload } from '@/lib/ScreenshotDetectionService';
import { format } from 'date-fns';

interface CaptureDetailsSheetProps {
  open: boolean;
  alert: CaptureAlertPayload | null;
  onOpenChange: (open: boolean) => void;
}

export function CaptureDetailsSheet({ open, alert, onOpenChange }: CaptureDetailsSheetProps) {
  if (!alert) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Capture alert</SheetTitle>
        </SheetHeader>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">Event</dt>
            <dd className="font-medium">{alert.eventType.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">Severity</dt>
            <dd className="font-medium capitalize">{alert.severity}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">When</dt>
            <dd>{format(alert.timestamp, 'PPpp')}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">Platform</dt>
            <dd>{alert.platform}</dd>
          </div>
          {alert.recordingDurationMs != null && (
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">Recording</dt>
              <dd>{Math.round(alert.recordingDurationMs / 1000)}s</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          A system message was added to the chat. You can adjust popup preferences in notification settings.
        </p>
      </SheetContent>
    </Sheet>
  );
}
