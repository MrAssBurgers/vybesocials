import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Search } from 'lucide-react';
import { EphemeralChatNotice } from '@/components/chat/EphemeralChatNotice';
import type { ViewMode } from '@/hooks/useMessages';

export interface ChatHeaderProps {
  onBack: () => void;
  onOpenSearch?: () => void;
  profileSlot: ReactNode;
  actionsSlot: ReactNode;
  viewMode: ViewMode;
  isGroupChat?: boolean;
  onViewModeChange: (mode: ViewMode) => void;
}

/** Floating pill DM header shell — profile + actions extracted from ChatView. */
export function ChatHeader({
  onBack,
  onOpenSearch,
  profileSlot,
  actionsSlot,
  viewMode,
  isGroupChat,
  onViewModeChange,
}: ChatHeaderProps) {
  const backHandledRef = useRef(false);

  const fireBack = () => {
    if (backHandledRef.current) return;
    backHandledRef.current = true;
    onBack();
    // Allow a later intentional tap (e.g. re-enter then leave again).
    window.setTimeout(() => {
      backHandledRef.current = false;
    }, 400);
  };

  return (
    <header
      className="dm-chat-header px-2 sm:px-3"
      data-no-auto-contrast
      style={{ paddingTop: 'var(--app-header-safe, env(safe-area-inset-top, 0px))' }}
    >
      <div className="dm-chat-header-row">
        <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
          <div className="dm-chat-header-pill dm-chat-header-pill--profile">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Back to messages"
              onPointerDown={(e) => {
                e.stopPropagation();
                backHandledRef.current = false;
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onPointerUp={(e) => {
                // Prefer pointerup: parent swipe-back often cancels click without leaving.
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                fireBack();
              }}
              onClick={(e) => {
                // Keyboard / leftover click path if pointerup did not fire.
                e.preventDefault();
                e.stopPropagation();
                fireBack();
              }}
              className="dm-chat-header-back flex-shrink-0 relative z-20 h-9 w-9 rounded-full hover:bg-white/10 pointer-events-auto"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {profileSlot}
          </div>
          <div className="dm-chat-header-pill dm-chat-header-pill--actions">
            {onOpenSearch ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSearch}
                className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-white/10"
                aria-label="Search in chat"
              >
                <Search className="h-4 w-4" />
              </Button>
            ) : null}
            {actionsSlot}
          </div>
        </div>
      </div>
      <EphemeralChatNotice
        viewMode={viewMode}
        isGroupChat={isGroupChat}
        onViewModeChange={onViewModeChange}
        compact
      />
    </header>
  );
}
