import type { ReactNode } from 'react';
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
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-white/10"
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
