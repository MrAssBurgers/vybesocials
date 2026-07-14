import { useLayoutEffect, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DMInboxPage } from '@/features/dms';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SmartErrorBoundary from '@/components/error/SmartErrorBoundary';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';
import { DmInboxSafeList } from '@/components/chat/dm-inbox/DmInboxSafeList';
import { cn } from '@/lib/utils';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';
import { LockedChatGate } from '@/components/chat/LockedChatGate';
import { prepareMessagesRoute } from '@/lib/loadDMConversations';
import { warmDmConversation } from '@/lib/warmDmConversation';
import { recoverDmQueryCache, readLastBoundaryError, LAST_BOUNDARY_ERROR_KEY } from '@/lib/recoverDmQueryCache';
import { leaveDmConversation } from '@/lib/leaveDmConversation';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { QueryClient } from '@tanstack/react-query';

const ChatView = lazy(() =>
  import('@/components/chat/ChatView').then((m) => ({ default: m.ChatView })),
);

function shouldShowBoundaryErrorDetail(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return /vybe-daaab\.(web\.app|firebaseapp\.com)/i.test(window.location.hostname);
}

function MessagesFallback() {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const { user } = useAuth();
  const lastError = shouldShowBoundaryErrorDetail() ? readLastBoundaryError() : null;

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
    try {
      sessionStorage.removeItem(LAST_BOUNDARY_ERROR_KEY);
    } catch {
      /* ignore */
    }
    window.location.assign('/messages');
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
      {lastError?.message && (
        <p className="text-xs text-muted-foreground/80 mb-4 max-w-sm font-mono break-all text-left">
          {lastError.message}
        </p>
      )}
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
  const navigate = useNavigate();
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Back to messages"
            className="h-9 w-9 shrink-0 rounded-full"
            onClick={() => leaveDmConversation(navigate)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
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

  useEffect(() => {
    const lastError = readLastBoundaryError();
    if (!lastError) return;
    const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__;
    if (!qc) return;
    recoverDmQueryCache(qc, profileId, user?.id);
    prepareMessagesRoute(qc, profileId, user?.id);
    try {
      sessionStorage.removeItem(LAST_BOUNDARY_ERROR_KEY);
    } catch {
      /* ignore */
    }
  }, [profileId, user?.id]);

  useLayoutEffect(() => {
    const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: QueryClient }).__REACT_QUERY_CLIENT__;
    // Seed from authUid even before profileId resolves so cache paints frame 0.
    if (qc && (profileId || user?.id) && !routePreparedRef.current) {
      prepareMessagesRoute(qc, profileId, user?.id);
      if (profileId) routePreparedRef.current = true;
    }
    // Preload chat chunk while viewing the inbox so open feels instant.
    if (qc && !conversationId) {
      void import('@/components/chat/ChatView');
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
    <AppLayout
      hideRightSidebar
      fullWidth
      hideNav={!isDesktop}
      noPadding
      enableSwipeBack={isInChat && !isDesktop}
    >
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
          <LocalErrorBoundary
            label="dm-inbox"
            resetKey={`dm-inbox-v4:${profileId || user?.id || 'anon'}`}
            fallback={
              <LocalErrorBoundary
                label="dm-inbox-safe"
                fallback={
                  <div className="dm-inbox flex flex-1 items-center justify-center p-8 text-center">
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Chat list hit a snag. Retry to reload.
                      </p>
                      <button
                        type="button"
                        className="text-sm font-semibold text-primary"
                        onClick={() => window.location.assign('/messages')}
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                }
              >
                <DmInboxSafeList />
              </LocalErrorBoundary>
            }
          >
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
