import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Eye, Mic, Camera, Video, MessageCircle } from 'lucide-react';

export type ActivityType = 'viewing' | 'typing' | 'recording_voice' | 'recording_video' | 'taking_photo' | 'idle';

interface LiveActivityIndicatorProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  activity: ActivityType;
  isVisible: boolean;
}

// Get activity config
const getActivityConfig = (activity: ActivityType) => {
  switch (activity) {
    case 'viewing':
      return {
        icon: Eye,
        label: 'Looking',
        color: 'text-green-500',
        bgColor: 'bg-green-500/20',
        ringColor: 'ring-green-500/50',
      };
    case 'typing':
      return {
        icon: MessageCircle,
        label: 'Typing',
        color: 'text-primary',
        bgColor: 'bg-primary/20',
        ringColor: 'ring-primary/50',
      };
    case 'recording_voice':
      return {
        icon: Mic,
        label: 'Recording',
        color: 'text-red-500',
        bgColor: 'bg-red-500/20',
        ringColor: 'ring-red-500/50',
      };
    case 'recording_video':
      return {
        icon: Video,
        label: 'Recording',
        color: 'text-purple-500',
        bgColor: 'bg-purple-500/20',
        ringColor: 'ring-purple-500/50',
      };
    case 'taking_photo':
      return {
        icon: Camera,
        label: 'Photo',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/20',
        ringColor: 'ring-amber-500/50',
      };
    default:
      return {
        icon: Eye,
        label: 'Here',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        ringColor: 'ring-muted-foreground/30',
      };
  }
};

// Animated dots for typing/recording
const AnimatedDots = memo(function AnimatedDots({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={cn("w-1.5 h-1.5 rounded-full", color.replace('text-', 'bg-'))}
          animate={{
            y: [0, -4, 0],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
});

// Main component - shows user's PFP with activity indicator at bottom of chat
export const LiveActivityIndicator = memo(function LiveActivityIndicator({
  avatarUrl,
  username,
  displayName,
  activity,
  isVisible,
}: LiveActivityIndicatorProps) {
  const signedUrl = useSignedUrl(avatarUrl);
  const config = getActivityConfig(activity);
  const Icon = config.icon;
  const showDots = activity === 'typing' || activity === 'recording_voice';

  return (
    <AnimatePresence>
      {isVisible && activity !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="flex items-center gap-3 py-2 px-3"
        >
          {/* Avatar with animated ring */}
          <div className="relative">
            <motion.div
              className={cn(
                "absolute inset-0 rounded-full ring-2",
                config.ringColor
              )}
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <Avatar className="h-9 w-9 relative z-10">
              <AvatarImage src={signedUrl || undefined} className="object-cover" />
              <AvatarFallback className={cn("text-xs font-semibold", config.bgColor, config.color)}>
                {(displayName || username || '?').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Activity badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 p-1 rounded-full z-20",
                config.bgColor,
                "border-2 border-background"
              )}
            >
              <Icon className={cn("h-2.5 w-2.5", config.color)} />
            </motion.div>
          </div>

          {/* Activity label with animation */}
          <div className="flex items-center gap-2">
            <motion.span
              key={activity}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn("text-xs font-medium", config.color)}
            >
              {displayName || username}
            </motion.span>
            
            {showDots ? (
              <AnimatedDots color={config.color} />
            ) : (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn("text-xs", config.color, "opacity-80")}
              >
                {config.label.toLowerCase()}
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// Compact inline version for message list
export const InlineActivityBubble = memo(function InlineActivityBubble({
  avatarUrl,
  username,
  activity,
}: {
  avatarUrl?: string | null;
  username?: string;
  activity: ActivityType;
}) {
  const signedUrl = useSignedUrl(avatarUrl);
  const config = getActivityConfig(activity);
  const Icon = config.icon;

  if (activity === 'idle') return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex items-end gap-2 mb-2"
    >
      <Avatar className="h-7 w-7 ring-2 ring-primary/20">
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
          {(username || '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <motion.div
        className={cn(
          "rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-lg backdrop-blur-sm",
          config.bgColor,
          "border border-border/30"
        )}
        animate={{ 
          boxShadow: [
            '0 4px 15px rgba(0,0,0,0.1)',
            '0 4px 20px rgba(var(--primary-rgb), 0.15)',
            '0 4px 15px rgba(0,0,0,0.1)',
          ]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
          {activity === 'typing' ? (
            <div className="flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className={cn("w-1.5 h-1.5 rounded-full", config.color.replace('text-', 'bg-'))}
                  animate={{
                    y: [0, -5, 0],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.12,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
          ) : (
            <span className={cn("text-xs font-medium", config.color)}>
              {config.label}...
            </span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});
