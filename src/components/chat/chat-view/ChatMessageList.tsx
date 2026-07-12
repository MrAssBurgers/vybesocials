import { forwardRef, type ReactNode, type UIEventHandler } from 'react';
import { cn } from '@/lib/utils';

export interface ChatMessageListProps {
  children: ReactNode;
  className?: string;
  wallpaperClassName?: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
}

/** Scroll container for DM thread messages (extracted from ChatView). */
export const ChatMessageList = forwardRef<HTMLDivElement, ChatMessageListProps>(
  function ChatMessageList({ children, className, wallpaperClassName, onScroll, style }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'dm-chat-messages vybe-chat-messages flex-1 overflow-y-auto overflow-x-hidden min-h-0',
          'px-3 sm:px-4 pb-3',
          wallpaperClassName,
          className,
        )}
        data-no-auto-contrast
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          ...style,
        }}
        onScroll={onScroll}
      >
        {children}
      </div>
    );
  },
);
