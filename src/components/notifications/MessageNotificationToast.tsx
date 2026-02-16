import { memo, useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { navigationRef } from '@/lib/navigationRef';

interface MessageNotificationToastProps {
  toastId: string | number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  messagePreview: string;
  conversationId: string;
}

/**
 * Fresh rounded message notification toast
 * Clicking instantly navigates to the DM
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
  
  const handleClick = useCallback(() => {
    toast.dismiss(toastId);
    // Navigate instantly via React Router — no full page reload
    if (navigationRef.current) {
      navigationRef.current(`/messages/${conversationId}`);
    } else {
      window.location.href = `/messages/${conversationId}`;
    }
  }, [toastId, conversationId]);

  return (
    <div 
      ref={containerRef}
      onClick={handleClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      className={cn(
        "flex items-center gap-3 px-4 py-3 w-[320px] max-w-[calc(100vw-2rem)] cursor-pointer",
        "bg-card/95 backdrop-blur-2xl rounded-[1.25rem]",
        "border border-primary/15",
        "shadow-[0_8px_32px_hsl(var(--primary)/0.12),0_2px_8px_hsl(var(--foreground)/0.06)]",
        "transition-all duration-150 ease-out",
        "touch-manipulation select-none",
        isPressed ? "scale-[0.97] shadow-[0_4px_16px_hsl(var(--primary)/0.08)]" : "hover:scale-[1.01]"
      )}
      style={{ 
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      tabIndex={-1}
    >
      {/* Primary accent bar */}
      <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-primary" />
      
      {/* Avatar with online ring */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-10 w-10 ring-2 ring-primary/25 ring-offset-2 ring-offset-card">
          <AvatarImage src={senderAvatar || undefined} />
          <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
            {senderName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Live indicator dot */}
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-card" />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-bold text-[0.8125rem] text-foreground truncate">
            {senderName}
          </p>
          <span className="text-[10px] text-muted-foreground font-medium">now</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5 leading-relaxed">
          {messagePreview}
        </p>
      </div>
      
      {/* Chat bubble icon */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center",
        "transition-all duration-150",
        isPressed ? "bg-primary/20 scale-90" : ""
      )}>
        <MessageCircle className="w-4 h-4 text-primary" />
      </div>
    </div>
  );
});

/**
 * Show a message notification with smooth entrance
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
