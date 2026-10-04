import { ReportContentDialog } from '@/components/safety/ReportContentDialog';
import { useReportMessage } from '@/hooks/useMessageActions';

/** The chosen target lives in memory only; the server captures verified evidence. */
export function MessageReportDialog({ messageId, conversationId, onClose }: { messageId: string; conversationId: string; onClose: () => void }) {
  const report = useReportMessage(JSON.stringify([conversationId, messageId]));
  return <ReportContentDialog key={report.sessionKey} open title="Report message"
    description="Choose a reason. Submitting shares a copy of this message’s available text and attachment details with the moderation team for review."
    onOpenChange={open => { if (!open) onClose(); }}
    onSubmit={async reason => { await report.mutateAsync({ messageId, reason }); }} />;
}
