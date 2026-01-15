import { motion } from 'framer-motion';
import { format } from 'date-fns';

interface CaptureSystemMessageProps {
  type: 'screenshot' | 'screen_recording_start' | 'screen_recording_stop' | 'possible_recording';
  timestamp: Date;
  username?: string;
}

export function CaptureSystemMessage({ type, timestamp, username = 'Someone' }: CaptureSystemMessageProps) {
  const getMessage = () => {
    switch (type) {
      case 'screenshot':
        return `${username} took a screenshot`;
      case 'screen_recording_start':
        return `${username} started screen recording`;
      case 'screen_recording_stop':
        return `Screen recording stopped`;
      case 'possible_recording':
        return `Possible screen recording detected`;
      default:
        return '';
    }
  };

  const getEmoji = () => {
    switch (type) {
      case 'screenshot':
        return '📸';
      case 'screen_recording_start':
      case 'screen_recording_stop':
      case 'possible_recording':
        return '🎥';
      default:
        return '📸';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex justify-center py-1.5 my-1"
    >
      {/* Snapchat-style system message - subtle, gray, centered */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/40 backdrop-blur-sm">
        <span className="text-xs leading-none">{getEmoji()}</span>
        <span className="text-[11px] text-muted-foreground/80 font-medium tracking-tight">
          {getMessage()}
        </span>
        <span className="text-[10px] text-muted-foreground/50 ml-0.5">
          {format(timestamp, 'h:mm a')}
        </span>
      </div>
    </motion.div>
  );
}
