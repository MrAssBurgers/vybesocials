/**
 * Minimized Call Bubble
 * 
 * A floating bubble that shows when call is minimized
 * Tap to expand back to full screen
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Phone, Video, Maximize2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MinimizedCallBubbleProps {
  displayName: string;
  displayAvatar?: string | null;
  isVideoCall: boolean;
  duration: number;
  hasRemoteVideo: boolean;
  onExpand: () => void;
}

export const MinimizedCallBubble = memo(function MinimizedCallBubble({
  displayName,
  displayAvatar,
  isVideoCall,
  duration,
  hasRemoteVideo,
  onExpand,
}: MinimizedCallBubbleProps) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onExpand}
      className={cn(
        "fixed bottom-24 right-4 z-[9998]",
        "flex items-center gap-3 p-3 pr-5",
        "rounded-full shadow-2xl",
        "bg-primary/90 backdrop-blur-xl",
        "border border-white/20",
        "cursor-pointer",
        "group"
      )}
    >
      {/* Pulsing indicator */}
      <motion.div
        className="absolute inset-0 rounded-full bg-primary"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ repeat: Infinity, duration: 2 }}
      />

      {/* Avatar */}
      <div className="relative">
        <Avatar className="h-12 w-12 ring-2 ring-white/30">
          <AvatarImage src={displayAvatar || undefined} />
          <AvatarFallback className="bg-white/20 text-white font-semibold">
            {displayName?.charAt(0) || '?'}
          </AvatarFallback>
        </Avatar>
        
        {/* Call type indicator */}
        <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-green-500">
          {isVideoCall ? (
            <Video className="h-3 w-3 text-white" />
          ) : (
            <Phone className="h-3 w-3 text-white" />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="text-left relative z-10">
        <p className="text-white font-medium text-sm truncate max-w-[100px]">
          {displayName}
        </p>
        <p className="text-white/70 text-xs font-mono">
          {formatDuration(duration)}
        </p>
      </div>

      {/* Expand icon */}
      <Maximize2 className="h-4 w-4 text-white/60 group-hover:text-white transition-colors relative z-10" />
    </motion.button>
  );
});
