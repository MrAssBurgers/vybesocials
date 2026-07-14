import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Search } from 'lucide-react';
import { EphemeralChatNotice } from '@/components/chat/EphemeralChatNotice';
import type { ViewMode } from '@/hooks/useMessages';
import { tryCloseDmThreadOverlay } from '@/lib/dmThreadBack';
import { prepareDmLeaveSideEffects, isDmConversationPath } from '@/lib/leaveDmConversation';
import { clearStaleViewportOverlays } from '@/lib/clearStaleViewportOverlays';
import { logDmNavDebug } from '@/lib/dmNavDebug';
import { type ReactNode } from 'react';

export interface ChatHeaderProps {
  onBack: () => void;
  onOpenSearch?: () => void;
  profileSlot: ReactNode;
  actionsSlot: ReactNode;
  viewMode: ViewMode;
  isGroupChat?: boolean;
  onViewModeChange: (mode: ViewMode) => void;
}

/**
 * Floating pill DM header shell.
 * Back is a real Link → /messages (replace) so leave works even when
 * pointerup/click handlers are cancelled by swipe/gesture layers.
 */
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
            <Link
              to="/messages"
              replace
              aria-label="Back to messages"
              data-dm-back-link
              className="dm-chat-header-back flex-shrink-0 relative z-[60] h-9 w-9 rounded-full hover:bg-white/10 pointer-events-auto inline-flex items-center justify-center text-foreground"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                logDmNavDebug('header-back-link-click');
                clearStaleViewportOverlays();
                // Close viewer/sheet first; stay on thread if something was open.
                if (tryCloseDmThreadOverlay()) {
                  e.preventDefault();
                  return;
                }
                prepareDmLeaveSideEffects();
                onBack();
                // Hard escape if leave leaves chat chrome mounted (URL/UI desync).
                window.setTimeout(() => {
                  const shellStillMounted = Boolean(
                    document.getElementById('vybe-chat-shield-root'),
                  );
                  if (isDmConversationPath(window.location.pathname) || shellStillMounted) {
                    window.location.replace('/messages');
                  }
                }, 120);
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            {profileSlot}
          </div>
          <div className="dm-chat-header-pill dm-chat-header-pill--actions">
            {onOpenSearch ? (
              <Button
                type="button"
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
