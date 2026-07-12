import { useLayoutEffect, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DMInboxPage } from '@/features/dms';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { motion } from 'framer-motion';
import { Send, Sparkles, MessageCircle, RefreshCw } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
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
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const { isDesktop } = useBreakpoint();
  const isInChat = Boolean(conversationId);
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
            'dm-sidebar h-full w-full md:w-80 lg:w-96 flex-shrink-0 min-w-0 min-h-0',
            isInChat ? 'hidden md:flex md:flex-col' : 'flex flex-col',
          )}
        >
          <LocalErrorBoundary label="dm-inbox" fallback={<DmInboxSafeList />}>
            <DMInboxPage />
          </LocalErrorBoundary>
        </div>

        <div
          className={cn(
            'messages-scroll flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative z-[1]',
            !isInChat && 'hidden md:flex',
          )}
        >
          {isInChat ? (
            <SmartErrorBoundary fallback={<MessagesFallback />}>
              <LockedChatGate conversationId={conversationId!}>
                <Suspense fallback={<ChatThreadLoadingShell />}>
                  <ChatView />
                </Suspense>
              </LockedChatGate>
            </SmartErrorBoundary>
          ) : (
            <div className="dm-empty-pane hidden md:flex flex-1 w-full min-h-0 items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full blur-xl"
                    style={{
                      width: 80 + i * 20,
                      height: 80 + i * 20,
                      left: `${10 + i * 14}%`,
                      top: `${20 + (i % 3) * 22}%`,
                      background: i % 2 === 0
                        ? 'hsl(var(--primary) / 0.15)'
                        : 'hsl(var(--accent) / 0.12)',
                    }}
                    animate={{
                      y: [0, -24, 0],
                      x: [0, i % 2 ? 12 : -12, 0],
                      opacity: [0.4, 0.7, 0.4],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 4 + i * 0.6,
                      delay: i * 0.35,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="dm-empty-state text-center relative z-10 px-10 py-10 max-w-md mx-4"
              >
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                    }}
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
                  />
                  <div className="absolute inset-[3px] rounded-full bg-background flex items-center justify-center">
                    <VybeMiniIcon size={40} showSparkles className="text-primary" />
                  </div>
                </div>

                <h2 className="flex flex-col items-center gap-2 mb-2">
                  <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Your
                  </span>
                  <VybeWordmark size="lg" />
                </h2>
                <p className="text-sm text-muted-foreground mb-1">Pick a conversation</p>
                <p className="text-xs text-muted-foreground/70 mb-6">
                  Snaps, voice notes, calls — all in one place
                </p>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/messages/new')}
                  className="relative inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-primary-foreground overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
                    boxShadow: '0 8px 32px hsl(var(--primary) / 0.35)',
                  }}
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
                  />
                  <Send className="h-4 w-4 relative z-10" />
                  <span className="relative z-10">Start a Chat</span>
                  <Sparkles className="h-3.5 w-3.5 relative z-10 opacity-80" />
                </motion.button>
              </motion.div>
            </div>
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
