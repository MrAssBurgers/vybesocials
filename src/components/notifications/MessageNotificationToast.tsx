import { memo, useCallback, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { triggerMouthZoom, isMouthZoomAvailable } from '@/lib/mouthZoomBridge';
import { useNavigate } from 'react-router-dom';
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
 * Custom message notification toast with mouth zoom animation
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
  
  const handleClick = useCallback(async () => {
    // Dismiss toast first
    toast.dismiss(toastId);
    
    // Get the toast element's rect for animation origin
    const rect = containerRef.current?.getBoundingClientRect();
    
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
    <div
      ref={containerRef}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 p-3 cursor-pointer w-full",
        "hover:bg-accent/50 transition-colors rounded-lg",
        "active:scale-[0.98] transition-transform"
      )}
    >
      <Avatar className="h-10 w-10 ring-2 ring-primary/20 flex-shrink-0">
        <AvatarImage src={senderAvatar || undefined} />
        <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground">
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
      
      <div className="text-xs text-muted-foreground/60">
        now
      </div>
    </div>
  );
});

/**
 * Show a message notification with mouth zoom animation
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
    }
  );
  
  return toastId;
}
