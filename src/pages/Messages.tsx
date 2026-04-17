import { useLocation } from 'react-router-dom';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';
import { AppLayout } from '@/components/layout/AppLayout';
import { useBreakpoint } from '@/hooks/usePlatform';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send } from 'lucide-react';

export default function Messages() {
  const location = useLocation();
  const { isDesktop } = useBreakpoint();
  const isInChat = location.pathname !== '/messages';
  const isImmersive = isInChat && !isDesktop;

  useEffect(() => {
    if (!isDesktop) {
      document.documentElement.setAttribute('data-dm-active', 'true');
      return () => {
        document.documentElement.removeAttribute('data-dm-active');
      };
    }
  }, [isDesktop]);

  return (
    <AppLayout hideRightSidebar fullWidth hideNav={isImmersive} noPadding>
      <div 
        className={`
          ${isImmersive
            ? 'h-[100dvh] fixed inset-0 z-50' 
            : 'min-h-[100dvh] md:min-h-screen h-[100dvh] md:h-screen w-full'
          } 
          flex max-w-full pb-0 bg-background/65 backdrop-blur-2xl
        `}
        style={{ 
          position: isImmersive ? 'fixed' : undefined,
          inset: isImmersive ? 0 : undefined,
          zIndex: isImmersive ? 50 : undefined,
          overflow: 'hidden',
        }}
      >
        {/* Conversation list */}
        <div 
          className={`w-full md:w-80 lg:w-96 border-r border-border/50 flex-shrink-0 min-w-0 bg-card/30 backdrop-blur-xl ${isInChat ? 'hidden md:flex md:flex-col' : 'flex flex-col'}`}
          style={{ overflow: 'hidden', height: '100%' }}
        >
          <ConversationList />
        </div>
        
        {/* Chat area */}
        <div 
          className={`flex-1 min-w-0 ${!isInChat ? 'hidden md:flex' : 'flex'} flex-col`}
          style={{ overflow: 'hidden', height: '100%' }}
        >
          {isInChat ? (
            <ChatView />
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center relative overflow-hidden">
              {/* Floating background particles */}
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
                {/* Animated chat bubbles */}
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
