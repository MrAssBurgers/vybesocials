import { memo, useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { triggerMouthZoom, isMouthZoomAvailable } from '@/lib/mouthZoomBridge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface MessageNotificationToastProps {
  toastId: string | number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  messagePreview: string;
  conversationId: string;
}

/**
 * Custom message notification toast with mouth zoom animation
 * Clicking triggers the portal transition to chat
 * Uses touch-manipulation to prevent outline glitches on hold
 */
export const MessageNotificationToast = memo(function MessageNotificationToast({
  toastId,
  senderId,
  senderName,
  senderAvatar,
  messagePreview,
  conversationId,
}: MessageNotificationToastProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  const handleClick = useCallback(async () => {
    // Start exit animation
    setIsExiting(true);
    
    // Get the toast element's rect for animation origin
    const rect = containerRef.current?.getBoundingClientRect();
    
    // Wait for exit animation
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Dismiss toast
    toast.dismiss(toastId);
    
    if (rect && isMouthZoomAvailable()) {
      // Trigger mouth zoom animation
      await triggerMouthZoom(
        rect,
        senderId,
        senderName,
        senderAvatar,
        senderName,
      );
    } else {
      // Fallback: navigate directly
      window.location.href = `/messages/${conversationId}`;
    }
  }, [toastId, senderId, senderName, senderAvatar, conversationId]);

  return (
    <motion.div
      ref={containerRef}
      onClick={handleClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ 
        opacity: isExiting ? 0 : 1, 
        y: isExiting ? -10 : 0, 
        scale: isExiting ? 0.95 : (isPressed ? 0.97 : 1)
      }}
      transition={{ 
        type: 'spring',
        stiffness: 500,
        damping: 35,
        mass: 0.5
      }}
      className={cn(
        "flex items-center gap-2.5 p-3 cursor-pointer w-full max-w-[300px]",
        "bg-background/95 backdrop-blur-xl rounded-2xl",
        "shadow-lg shadow-black/10 border border-border/50",
        "touch-manipulation select-none outline-none",
        // Prevent outline glitches
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      )}
      style={{ willChange: 'transform, opacity' }}
    >
      {/* Avatar with glow effect */}
      <motion.div
        animate={{ scale: isPressed ? 0.95 : 1 }}
        transition={{ duration: 0.1 }}
      >
        <Avatar className="h-10 w-10 ring-2 ring-primary/30 flex-shrink-0 shadow-md">
          <AvatarImage src={senderAvatar || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm font-semibold">
            {senderName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </motion.div>
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">
          {senderName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {messagePreview}
        </p>
      </div>
      
      {/* Subtle arrow indicator */}
      <motion.div
        animate={{ x: isPressed ? 2 : 0, opacity: isPressed ? 0.5 : 0.3 }}
        className="text-muted-foreground"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </motion.div>
    </motion.div>
  );
});

/**
 * Show a message notification with entrance animation
 */
export function showMessageNotification(
  senderId: string,
  senderName: string,
  senderAvatar: string | null,
  messagePreview: string,
  conversationId: string,
) {
  const toastId = toast.custom(
    (id) => (
      <MessageNotificationToast
        toastId={id}
        senderId={senderId}
        senderName={senderName}
        senderAvatar={senderAvatar}
        messagePreview={messagePreview}
        conversationId={conversationId}
      />
    ),
    {
      duration: 4000,
      position: 'top-center',
      // Remove default sonner animation since we handle it ourselves
      className: '!bg-transparent !border-none !shadow-none !p-0',
    }
  );
  
  return toastId;
}
