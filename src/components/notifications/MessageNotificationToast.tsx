import { memo, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
 * Snapchat-style in-app chat banner — dark pill, avatar + name + preview, tap to open.
 */
export const MessageNotificationToast = memo(function MessageNotificationToast({
  toastId,
  senderName,
  senderAvatar,
  messagePreview,
  conversationId,
}: MessageNotificationToastProps) {
  const navigateToDM = useCallback(() => {
    toast.dismiss(toastId);
    const route = `/messages/${conversationId}`;
    if (navigationRef.current) navigationRef.current(route);
    else window.location.href = route;
  }, [toastId, conversationId]);

  return (
    <button
      type="button"
      onClick={navigateToDM}
      className={cn(
        'flex items-center gap-3 w-[min(100vw-1.25rem,22rem)] mx-auto px-3.5 py-3',
        'rounded-2xl bg-[#121212]/95 backdrop-blur-xl',
        'border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.45)]',
        'text-left touch-manipulation select-none active:scale-[0.98] transition-transform',
      )}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Avatar className="h-11 w-11 flex-shrink-0 ring-2 ring-white/15">
        <AvatarImage src={senderAvatar || undefined} className="object-cover" />
        <AvatarFallback className="bg-white/10 text-white text-sm font-bold">
          {senderName[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-white truncate leading-tight">
          {senderName}
        </p>
        <p className="text-[13px] text-white/65 truncate mt-0.5 leading-snug">
          {messagePreview || 'Sent you a chat'}
        </p>
      </div>

      <span className="text-[11px] font-medium text-white/40 flex-shrink-0">now</span>
    </button>
  );
});

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
  void messageId;
  void messageContent;
  void mediaUrl;
  void mediaType;
  void senderId;

  return toast.custom(
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
      duration: 4500,
      position: 'top-center',
      className: '!bg-transparent !border-none !shadow-none !p-0 !outline-none !mt-[calc(var(--sat,env(safe-area-inset-top,0px))+0.35rem)]',
      style: { outline: 'none', boxShadow: 'none' },
    },
  );
}
