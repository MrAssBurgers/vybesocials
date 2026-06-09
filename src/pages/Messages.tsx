import { useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function MessagesLoadingSkeleton() {
  return (
    <AppLayout hideRightSidebar fullWidth noPadding>
      <div className="flex flex-1 min-h-0 w-full bg-background overflow-hidden">
        <div className="w-full md:w-80 lg:w-96 border-r border-border/50 flex-shrink-0 bg-card/30 p-3 space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton variant="circular" className="h-12 w-12" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:flex flex-1" />
      </div>
    </AppLayout>
  );
}

export default function Messages() {
  const location = useLocation();
  const { isDesktop } = useBreakpoint();
  const [mounted, setMounted] = useState(false);
  const isInChat = location.pathname !== '/messages';
  const isImmersive = isInChat && !isDesktop;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isDesktop) {
      document.documentElement.setAttribute('data-dm-active', 'true');
      return () => {
        document.documentElement.removeAttribute('data-dm-active');
      };
    }
  }, [isDesktop, mounted]);

  if (!mounted) {
    return <MessagesLoadingSkeleton />;
  }

  return (
    <AppLayout hideRightSidebar fullWidth hideNav={isImmersive} noPadding>
      <div
        className={cn(
          'flex flex-1 min-h-0 w-full max-w-full overflow-hidden bg-background',
          !isImmersive && 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
        )}
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Conversation list */}
        <div
          className={cn(
            'w-full md:w-80 lg:w-96 border-r border-border/50 flex-shrink-0 min-w-0 min-h-0 bg-card/30 backdrop-blur-xl',
            isInChat ? 'hidden md:flex md:flex-col' : 'flex flex-col',
          )}
        >
          <ConversationList />
        </div>

        {/* Chat area */}
        <div
          className={cn(
            'flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden',
            !isInChat && 'hidden md:flex',
          )}
        >
          {isInChat ? (
            <ChatView />
          ) : (
            <div className="hidden md:flex flex-1 w-full min-h-0 items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-primary/10"
                    style={{
                      left: `${20 + i * 15}%`,
                      top: `${30 + (i % 3) * 20}%`,
                    }}
                    animate={{
                      y: [0, -20, 0],
                      opacity: [0.2, 0.5, 0.2],
                      scale: [1, 1.3, 1],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3 + i * 0.5,
                      delay: i * 0.4,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>

              <div className="text-center relative z-10 liquid-glass-depth px-10 py-8 max-w-sm mx-4">
                <div className="relative w-20 h-20 mx-auto mb-5">
                  <motion.div
                    animate={{ y: [0, -6, 0], rotate: [0, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="relative">
                      <MessageCircle className="h-12 w-12 text-primary/60" />
                      <motion.div
                        animate={{ scale: [0.8, 1.1, 0.8], opacity: [0.5, 0.8, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                        className="absolute -top-1 -right-1"
                      >
                        <MessageCircle className="h-6 w-6 text-primary/80" />
                      </motion.div>
                    </div>
                  </motion.div>
                </div>

                <p className="text-lg font-semibold text-foreground mb-1.5">
                  Select a conversation
                </p>
                <p className="text-sm text-muted-foreground mb-5">or start a new chat</p>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium overflow-hidden group"
                >
                  <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  <Send className="h-4 w-4 relative z-10" />
                  <span className="relative z-10">Start a Chat</span>
                </motion.button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
