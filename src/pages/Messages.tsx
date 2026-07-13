import { useLayoutEffect, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DMInboxPage } from '@/features/dms';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SmartErrorBoundary from '@/components/error/SmartErrorBoundary';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';
import { DmInboxSafeList } from '@/components/chat/dm-inbox/DmInboxSafeList';
import { cn } from '@/lib/utils';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';
import { LockedChatGate } from '@/components/chat/LockedChatGate';
import { prepareMessagesRoute } from '@/lib/loadDMConversations';
import { warmDmConversation } from '@/lib/warmDmConversation';
import { recoverDmQueryCache } from '@/lib/recoverDmQueryCache';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { QueryClient } from '@tanstack/react-query';

const ChatView = lazy(() =>
  import('@/components/chat/ChatView').then((m) => ({ default: m.ChatView })),
);

function MessagesFallback() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const { user } = useAuth();

  const handleReload = () => {
    void (async () => {
      try {
        const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__;
        if (qc) {
          recoverDmQueryCache(qc, profileId, user?.id);
          prepareMessagesRoute(qc, profileId, user?.id);
        }
        const { del } = await import('idb-keyval');
        await del('vybe-react-query-cache');
      } catch {
        /* best effort */
      }
      window.location.reload();
    })();
  };

  const handleSoftRetry = () => {
    const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__;
    if (qc) {
      recoverDmQueryCache(qc, profileId, user?.id);
      prepareMessagesRoute(qc, profileId, user?.id);
    }
    navigate('/messages', { replace: true });
  };

  return (
    <div className="page-shell messages-content messages-scroll flex flex-col items-center justify-center h-full w-full p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center mb-4">
        <MessageCircle className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Couldn't load Messages</h2>
      <p className="text-sm text-muted-foreground mb-5 max-w-xs">
        Your message cache hit a snag. Retry to reopen DMs without losing the rest of the app.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={handleSoftRetry} variant="outline" className="gap-2 border-primary/30 bg-primary/10 hover:bg-primary/20">
          <RefreshCw className="w-4 h-4" /> Retry
        </Button>
        <Button onClick={handleReload} className="gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground">
          <RefreshCw className="w-4 h-4" /> Full reload
        </Button>
      </div>
    </div>
  );
}

function ChatThreadLoadingShell() {
  return (
    <div
      className="flex flex-col h-full w-full min-h-0 bg-background/80"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      <div
        className="dm-chat-header px-3 border-b border-border/20"
        style={{ paddingTop: 'var(--app-header-safe, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3 h-14">
          <div className="h-8 w-8 rounded-full bg-muted/60 animate-pulse" />
          <div className="h-9 w-9 rounded-full bg-muted/60 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-28 rounded-full bg-muted/60 animate-pulse" />
            <div className="h-2.5 w-16 rounded-full bg-muted/40 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4 space-y-4">
        <div className="h-10 w-[58%] rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-10 w-[45%] rounded-2xl bg-muted/30 animate-pulse ml-auto" />
        <div className="h-10 w-[52%] rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
}

function MessagesInner() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const { isDesktop } = useBreakpoint();
  const isInChat = Boolean(conversationId);
  const showInboxSplit = isInChat && isDesktop;
  const showLiquidBg = useDefaultLiquidBackground();
  const routePreparedRef = useRef(false);

  useEffect(() => {
    routePreparedRef.current = false;
  }, [profileId, user?.id]);

  useLayoutEffect(() => {
    const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__;
    if (qc && profileId && !routePreparedRef.current) {
      prepareMessagesRoute(qc, profileId, user?.id);
      routePreparedRef.current = true;
    }
    if (qc && conversationId) {
      warmDmConversation(qc, conversationId, profileId, profileId, 'high');
      void import('@/components/chat/ChatView');
    }

    if (!isInChat) return;
    document.documentElement.setAttribute('data-dm-active', 'true');
    return () => {
      document.documentElement.removeAttribute('data-dm-active');
    };
  }, [isInChat, conversationId, profileId, user?.id]);

  return (
    <AppLayout hideRightSidebar fullWidth hideNav={!isDesktop} noPadding>
      <div
        className={cn(
          'dm-shell messages-content flex h-full flex-1 min-h-0 w-full max-w-full overflow-hidden',
          showLiquidBg && 'bg-transparent',
        )}
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        <div
          className={cn(
            'dm-sidebar h-full min-w-0 min-h-0 flex flex-col',
            isInChat && !showInboxSplit && 'hidden',
            showInboxSplit && 'hidden lg:flex lg:w-96 lg:flex-shrink-0',
            !isInChat && 'w-full flex-1',
          )}
        >
          <LocalErrorBoundary label="dm-inbox" fallback={<DmInboxSafeList />}>
            <DMInboxPage />
          </LocalErrorBoundary>
        </div>

        <div
          className={cn(
            'messages-scroll flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative z-[1]',
            !isInChat && 'hidden',
          )}
        >
          {isInChat && (
            <SmartErrorBoundary fallback={<MessagesFallback />}>
              <LockedChatGate conversationId={conversationId!}>
                <Suspense fallback={<ChatThreadLoadingShell />}>
                  <ChatView />
                </Suspense>
              </LockedChatGate>
            </SmartErrorBoundary>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

export default function Messages() {
  return (
    <SmartErrorBoundary fallback={<MessagesFallback />}>
      <MessagesInner />
    </SmartErrorBoundary>
  );
}
