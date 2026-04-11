import { memo, useCallback, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';
import { navigationRef } from '@/lib/navigationRef';
import { DMHoldMenu } from '@/components/chat/DMHoldMenu';

interface MessageNotificationToastProps {
  toastId: string | number;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  messagePreview: string;
  conversationId: string;
  messageId?: string;
  messageContent?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

/**
 * Fresh rounded message notification toast
 * Tap navigates to DM, long-press opens the same hold menu as DM bubbles
 */
export const MessageNotificationToast = memo(function MessageNotificationToast({
  toastId,
  senderId,
  senderName,
  senderAvatar,
  messagePreview,
  conversationId,
  messageId,
  messageContent,
  mediaUrl,
  mediaType,
}: MessageNotificationToastProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Long-press detection
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const menuOpenedRef = useRef(false);
  const LONG_PRESS_MS = 400;
  const MOVE_TOLERANCE = 10;

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const navigateToDM = useCallback(() => {
    toast.dismiss(toastId);
    if (navigationRef.current) {
      navigationRef.current(`/messages/${conversationId}`);
    } else {
      window.location.href = `/messages/${conversationId}`;
    }
  }, [toastId, conversationId]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsPressed(true);
    longPressTimerRef.current = setTimeout(() => {
      menuOpenedRef.current = true;
      setShowMenu(true);
      if ('vibrate' in navigator) navigator.vibrate(10);
    }, LONG_PRESS_MS);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartRef.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      clearLongPress();
    }
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
    setIsPressed(false);
    touchStartRef.current = null;
    // If menu was not opened, treat as tap → navigate
    if (!menuOpenedRef.current) {
      navigateToDM();
    }
  }, [clearLongPress, navigateToDM]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // On desktop, click navigates. Menu is via right-click.
    if (!menuOpenedRef.current) {
      navigateToDM();
    }
  }, [navigateToDM]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    menuOpenedRef.current = true;
    setShowMenu(true);
  }, []);

  const handleMenuClose = useCallback(() => {
    setShowMenu(false);
    menuOpenedRef.current = false;
  }, []);

  return (
    <>
      <div 
        ref={containerRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => { clearLongPress(); setIsPressed(false); }}
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

      {/* Shared DM hold menu */}
      <DMHoldMenu
        open={showMenu}
        onClose={handleMenuClose}
        messageContent={messageContent}
        mediaUrl={mediaUrl}
        mediaType={mediaType}
        isOwn={false}
        onReaction={() => {
          // From notification, navigate to DM after reacting
          handleMenuClose();
          navigateToDM();
        }}
        onReply={() => {
          handleMenuClose();
          navigateToDM();
        }}
      />
    </>
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
  messageId?: string,
  messageContent?: string | null,
  mediaUrl?: string | null,
  mediaType?: string | null,
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
        messageId={messageId}
        messageContent={messageContent}
        mediaUrl={mediaUrl}
        mediaType={mediaType}
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
