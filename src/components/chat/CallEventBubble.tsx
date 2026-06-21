import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCallEventLabel, parseCallEventMeta } from '@/lib/callChatMessages';

interface CallEventBubbleProps {
  content: string | null;
  isOwn: boolean;
  callTypeHint?: 'audio' | 'video';
}

/** Snapchat-style call log row centered in the DM thread. */
export const CallEventBubble = memo(function CallEventBubble({
  content,
  isOwn,
  callTypeHint = 'audio',
}: CallEventBubbleProps) {
  const meta = parseCallEventMeta(content);
  const callType = meta?.callType || callTypeHint;
  const label = meta
    ? formatCallEventLabel(meta, isOwn)
    : (content || (callType === 'video' ? 'Video call' : 'Audio call'));

  const isMissed =
    meta?.kind === 'missed' ||
    meta?.kind === 'no_answer' ||
    meta?.kind === 'declined';
  const isEnded = meta?.kind === 'ended';
  const isOutgoing = meta?.kind === 'outgoing';

  const Icon =
    isMissed ? PhoneMissed :
    isOutgoing ? PhoneOutgoing :
    isEnded ? (callType === 'video' ? Video : Phone) :
    PhoneIncoming;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="flex justify-center py-1.5"
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium backdrop-blur-sm border',
          isMissed
            ? 'bg-destructive/10 border-destructive/25 text-destructive'
            : 'bg-muted/40 border-border/30 text-muted-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </div>
    </motion.div>
  );
});
