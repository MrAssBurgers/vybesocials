import { useState } from 'react';
import { NotesRow } from '@/components/chat/NotesRow';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

/** Notes share the inbox scroll area and cannot take down the conversation list. */
export function InboxNotes() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  if (!user?.id || session.uid !== user.id) return null;
  return <NotesPanel key={JSON.stringify([user.id, session.epoch])} />;
}

function NotesPanel() {
  const [attempt, setAttempt] = useState(0);
  return (
    <section aria-label="Notes" className="min-w-0 pt-3">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-1">
        <h2 className="text-sm font-semibold">Notes</h2>
        <span className="text-[11px] text-muted-foreground">Lasts 24 hours</span>
      </div>
      <LocalErrorBoundary
        label="dm-notes-row"
        resetKey={attempt}
        fallback={
          <div role="alert" className="mx-4 mb-3 rounded-2xl border border-border/50 bg-muted/40 p-3 text-xs">
            <p>Notes could not open. Your chats are still available.</p>
            <Button type="button" variant="ghost" size="sm" className="mt-1 rounded-full" onClick={() => setAttempt(value => value + 1)}>
              Retry notes
            </Button>
          </div>
        }
      >
        <NotesRow />
      </LocalErrorBoundary>
    </section>
  );
}
