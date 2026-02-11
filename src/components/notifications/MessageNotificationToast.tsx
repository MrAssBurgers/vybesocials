import { memo, useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { triggerMouthZoom, isMouthZoomAvailable } from '@/lib/mouthZoomBridge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MessageNotificationToastProps {
  toastId: string | number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  messagePreview: string;
  conversationId: string;
}

/**
 * Clean message notification toast
 * Clicking triggers the portal transition to chat
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
  
  const handleClick = useCallback(async () => {
    const rect = containerRef.current?.getBoundingClientRect();
    toast.dismiss(toastId);
    
    if (rect && isMouthZoomAvailable()) {
      await triggerMouthZoom(
        rect,
        senderId,
        senderName,
        senderAvatar,
        senderName,
      );
    } else {
      window.location.href = `/messages/${conversationId}`;
    }
  }, [toastId, senderId, senderName, senderAvatar, conversationId]);

  return (
    <div 
      ref={containerRef}
      onClick={handleClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      className={cn(
        "flex items-center gap-2.5 p-3 w-[300px] max-w-full cursor-pointer",
        "bg-background/92 backdrop-blur-xl rounded-2xl",
        "border border-border/50",
        "shadow-[0_4px_24px_hsl(var(--background)/0.3),0_1px_4px_hsl(var(--foreground)/0.05)]",
        "transition-transform duration-100 ease-out",
        "touch-manipulation select-none",
        isPressed && "scale-[0.98]"
      )}
      style={{ 
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      tabIndex={-1}
    >
      {/* Avatar */}
      <Avatar className="h-9 w-9 ring-1.5 ring-primary/20 flex-shrink-0">
        <AvatarImage src={senderAvatar || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {senderName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[0.8125rem] text-foreground truncate">
          {senderName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {messagePreview}
        </p>
      </div>
      
      {/* Arrow indicator */}
      <div className={cn(
        "text-muted-foreground transition-opacity duration-100",
        isPressed ? "opacity-50" : "opacity-30"
      )}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
});

/**
 * Show a message notification
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
      className: '!bg-transparent !border-none !shadow-none !p-0 !outline-none',
      style: {
        outline: 'none',
        boxShadow: 'none',
      },
    }
  );
  
  return toastId;
}
