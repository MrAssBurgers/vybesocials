import { memo, useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { triggerMouthZoom, isMouthZoomAvailable } from '@/lib/mouthZoomBridge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

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
 * Fixed: Static container prevents outline shift during press
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
    // Static outer container - fixed dimensions prevent layout shifts
    <div 
      ref={containerRef}
      className="relative w-[300px] max-w-full"
    >
      {/* Clickable area with complete isolation from focus styles */}
      <div
        onClick={handleClick}
        onPointerDown={() => setIsPressed(true)}
        onPointerUp={() => setIsPressed(false)}
        onPointerLeave={() => setIsPressed(false)}
        onPointerCancel={() => setIsPressed(false)}
        className="touch-manipulation select-none cursor-pointer"
        style={{ 
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
          boxShadow: 'none',
        }}
        tabIndex={-1}
      >
        {/* Animated inner content - scale only, no border/outline changes */}
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ 
            opacity: isExiting ? 0 : 1, 
            y: isExiting ? -10 : 0, 
            scale: isExiting ? 0.95 : (isPressed ? 0.98 : 1),
            boxShadow: isPressed 
              ? '0 2px 8px rgba(0,0,0,0.08)'
              : '0 4px 20px rgba(0,0,0,0.12)'
          }}
          transition={{ 
            type: 'spring',
            stiffness: 500,
            damping: 35,
            mass: 0.5
          }}
          className={cn(
            "flex items-center gap-2.5 p-3 w-full",
            "bg-background/95 backdrop-blur-xl rounded-2xl",
            "border border-border/50",
            // Ensure no outline styles can leak through
            "!outline-none focus:!outline-none focus-visible:!outline-none"
          )}
          style={{ 
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
            outline: 'none !important',
          }}
        >
          {/* Avatar */}
          <Avatar className={cn(
            "h-10 w-10 ring-2 ring-primary/30 flex-shrink-0 shadow-md",
            "transition-transform duration-100",
            isPressed && "scale-95"
          )}>
            <AvatarImage src={senderAvatar || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground text-sm font-semibold">
              {senderName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {senderName}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {messagePreview}
            </p>
          </div>
          
          {/* Arrow indicator */}
          <div className={cn(
            "text-muted-foreground transition-all duration-100",
            isPressed ? "opacity-50 translate-x-0.5" : "opacity-30"
          )}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </motion.div>
      </div>
    </div>
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
      // Remove default sonner styles completely
      className: '!bg-transparent !border-none !shadow-none !p-0 !outline-none',
      style: {
        outline: 'none',
        boxShadow: 'none',
      },
    }
  );
  
  return toastId;
}
