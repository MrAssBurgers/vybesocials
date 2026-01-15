import { motion } from 'framer-motion';
import { Camera, Video } from 'lucide-react';
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
        return `📸 ${username} took a screenshot`;
      case 'screen_recording_start':
        return `🎥 ${username} started screen recording`;
      case 'screen_recording_stop':
        return `🎥 Screen recording stopped`;
      case 'possible_recording':
        return `🎥 Possible screen recording detected`;
      default:
        return '';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'screenshot':
        return <Camera className="w-3 h-3" />;
      default:
        return <Video className="w-3 h-3" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="flex justify-center py-2"
    >
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 backdrop-blur-sm border border-border/30">
        <span className="text-muted-foreground/70">
          {getIcon()}
        </span>
        <span className="text-xs text-muted-foreground font-medium">
          {getMessage()}
        </span>
        <span className="text-[10px] text-muted-foreground/50 ml-1">
          {format(timestamp, 'h:mm a')}
        </span>
      </div>
    </motion.div>
  );
}
