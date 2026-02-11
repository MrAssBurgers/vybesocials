import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Eye, Check, CheckCheck, Send, ArrowUp } from 'lucide-react';

// Message status types like Snapchat
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'opened' | 'screenshot' | 'replayed';

interface SnapchatStatusProps {
  status: MessageStatus;
  timestamp?: string;
  isOutgoing?: boolean;
  animate?: boolean;
}

// Snapchat-style status indicator for messages
export const SnapchatStatus = memo(function SnapchatStatus({
  status,
  timestamp,
  isOutgoing = true,
  animate = true,
}: SnapchatStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'sending':
        return { 
          icon: ArrowUp, 
          color: 'text-muted-foreground', 
          label: 'Sending...',
          filled: false 
        };
      case 'sent':
        return { 
          icon: Check, 
          color: 'text-muted-foreground', 
          label: 'Sent',
          filled: false 
        };
      case 'delivered':
        return { 
          icon: CheckCheck, 
          color: 'text-blue-500', 
          label: 'Delivered',
          filled: true 
        };
      case 'opened':
        return { 
          icon: Eye, 
          color: 'text-purple-500', 
          label: 'Opened',
          filled: true 
        };
      case 'screenshot':
        return { 
          icon: Eye, 
          color: 'text-red-500', 
          label: 'Screenshot!',
          filled: true 
        };
      case 'replayed':
        return { 
          icon: Eye, 
          color: 'text-green-500', 
          label: 'Replayed',
          filled: true 
        };
      default:
        return { 
          icon: Check, 
          color: 'text-muted-foreground', 
          label: '',
          filled: false 
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <motion.div
      initial={animate ? { opacity: 0, scale: 0.8 } : false}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-1 text-[10px] font-medium",
        config.color
      )}
    >
      <motion.div
        key={status}
        initial={animate ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      >
        <Icon className="h-3 w-3" strokeWidth={config.filled ? 2.5 : 2} />
      </motion.div>
      <span className="opacity-90">{config.label}</span>
      {timestamp && (
        <span className="opacity-60 ml-0.5">{timestamp}</span>
      )}
    </motion.div>
  );
});

interface SnapTypingBubbleProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

// Snapchat-style typing bubble that appears in chat
export const SnapTypingBubble = memo(function SnapTypingBubble({
  avatarUrl,
  username,
  displayName,
  size = 'md',
}: SnapTypingBubbleProps) {
  const signedUrl = useSignedUrl(avatarUrl);
  
  const sizeClasses = {
    sm: { avatar: 'h-6 w-6', bubble: 'px-3 py-2', dot: 'w-1.5 h-1.5' },
    md: { avatar: 'h-8 w-8', bubble: 'px-4 py-3', dot: 'w-2 h-2' },
    lg: { avatar: 'h-10 w-10', bubble: 'px-5 py-4', dot: 'w-2.5 h-2.5' },
  };

  const classes = sizeClasses[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="flex items-end gap-2"
    >
      <Avatar className={cn(classes.avatar, "ring-2 ring-primary/20")}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
          {username?.charAt(0).toUpperCase() || '?'}
        </AvatarFallback>
      </Avatar>
      
      <motion.div
        className={cn(
          "bg-muted/80 backdrop-blur-sm rounded-2xl rounded-bl-sm shadow-lg",
          classes.bubble
        )}
        animate={{ 
          boxShadow: [
            '0 4px 15px rgba(0,0,0,0.1)',
            '0 4px 20px rgba(var(--primary), 0.15)',
            '0 4px 15px rgba(0,0,0,0.1)',
          ]
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={cn(classes.dot, "rounded-full bg-primary")}
              animate={{
                y: [0, -6, 0],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
});

interface LivePresenceBarProps {
  isOnline: boolean;
  isTyping: boolean;
  lastSeen?: string;
  username?: string;
  isInChat?: boolean;
}

// Animated typing dots - CSS based for smoothness
const TypingDots = memo(function TypingDots() {
  return (
    <span className="inline-flex items-center ml-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 mx-[1px] rounded-full bg-current typing-dot"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
});

// Live presence bar showing real-time status
export const LivePresenceBar = memo(function LivePresenceBar({
  isOnline,
  isTyping,
  lastSeen,
  username,
  isInChat,
}: LivePresenceBarProps) {
  // Simple status text without the dots (dots are animated separately)
  const getStaticStatusText = () => {
    if (isInChat && !isTyping) return 'in chat';
    if (isOnline && !isTyping) return 'online';
    if (lastSeen) return `last seen ${lastSeen}`;
    return 'offline';
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Status dot - only show when online or typing */}
      {(isTyping || isOnline) && (
        <div
          className={cn(
            "w-2 h-2 rounded-full transition-colors duration-200",
            isTyping ? "bg-primary animate-pulse" : "bg-green-500"
          )}
        />
      )}
      
      {/* Status text - typing has static "typing" + animated dots */}
      {isTyping ? (
        <span className="text-xs font-medium text-primary">
          typing<TypingDots />
        </span>
      ) : (
        <span
          className={cn(
            "text-xs font-medium transition-colors duration-200",
            isOnline ? "text-green-500" : "text-muted-foreground"
          )}
        >
          {getStaticStatusText()}
        </span>
      )}
    </div>
  );
});

interface OpenedIndicatorProps {
  viewerAvatarUrl?: string | null;
  viewerUsername?: string;
  openedAt?: string;
  isRecent?: boolean;
}

// "Opened" indicator like Snapchat
export const OpenedIndicator = memo(function OpenedIndicator({
  viewerAvatarUrl,
  viewerUsername,
  openedAt,
  isRecent = false,
}: OpenedIndicatorProps) {
  const signedUrl = useSignedUrl(viewerAvatarUrl);

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5"
    >
      {/* Purple "opened" square like Snapchat */}
      <motion.div
        className={cn(
          "w-3 h-3 rounded-sm",
          isRecent ? "bg-purple-500" : "bg-purple-500/60"
        )}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      />
      
      <span className="text-[10px] text-purple-500 font-medium">
        Opened
      </span>
      
      {openedAt && (
        <span className="text-[10px] text-muted-foreground">
          {openedAt}
        </span>
      )}
      
      {signedUrl && (
        <Avatar className="h-4 w-4 ml-0.5">
          <AvatarImage src={signedUrl} />
          <AvatarFallback className="text-[8px]">
            {viewerUsername?.charAt(0)}
          </AvatarFallback>
        </Avatar>
      )}
    </motion.div>
  );
});

interface DeliveredIndicatorProps {
  deliveredAt?: string;
}

// "Delivered" indicator
export const DeliveredIndicator = memo(function DeliveredIndicator({
  deliveredAt,
}: DeliveredIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5"
    >
      {/* Blue "delivered" square */}
      <motion.div
        className="w-3 h-3 rounded-sm bg-blue-500"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
      />
      
      <span className="text-[10px] text-blue-500 font-medium">
        Delivered
      </span>
      
      {deliveredAt && (
        <span className="text-[10px] text-muted-foreground">
          {deliveredAt}
        </span>
      )}
    </motion.div>
  );
});

interface ScreenshotAlertProps {
  username?: string;
  onDismiss?: () => void;
}

// Screenshot alert popup
export const ScreenshotAlert = memo(function ScreenshotAlert({
  username,
  onDismiss,
}: ScreenshotAlertProps) {
  useEffect(() => {
    if (onDismiss) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="bg-red-500 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="text-sm font-medium">
          {username ? `${username} took a screenshot!` : 'Screenshot taken!'}
        </span>
      </div>
    </motion.div>
  );
});
