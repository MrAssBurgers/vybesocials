import { memo, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCreateConversation } from '@/hooks/useMessages';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';

interface TransitionState {
  isAnimating: boolean;
  sourceRect: DOMRect | null;
  targetUserId: string | null;
  targetUsername: string | null;
  targetAvatarUrl: string | null;
  targetDisplayName: string | null;
}

/**
 * NotificationToChatTransition - Provides smooth expand animation from notification to chat
 */
export const NotificationToChatTransition = memo(function NotificationToChatTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const { prefetchConversation } = useChatPrefetch();
  const [transition, setTransition] = useState<TransitionState>({
    isAnimating: false,
    sourceRect: null,
    targetUserId: null,
    targetUsername: null,
    targetAvatarUrl: null,
    targetDisplayName: null,
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  const startTransition = useCallback(async (
    e: React.MouseEvent | React.TouchEvent,
    userId: string,
    username: string,
    avatarUrl: string | null,
    displayName: string | null,
  ) => {
    const element = (e.currentTarget as HTMLElement);
    const rect = element.getBoundingClientRect();
    
    // Start animation immediately
    setTransition({
      isAnimating: true,
      sourceRect: rect,
      targetUserId: userId,
      targetUsername: username,
      targetAvatarUrl: avatarUrl,
      targetDisplayName: displayName,
    });

    // Prefetch chat data in background
    prefetchConversation(userId);

    // Navigate after short delay for animation
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [userId] });
      
      // Wait for animation to complete
      await new Promise(resolve => setTimeout(resolve, 280));
      
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      console.error('Failed to navigate to chat:', error);
    } finally {
      // Reset state after navigation
      setTimeout(() => {
        setTransition({
          isAnimating: false,
          sourceRect: null,
          targetUserId: null,
          targetUsername: null,
          targetAvatarUrl: null,
          targetDisplayName: null,
        });
      }, 100);
    }
  }, [createConversation, navigate, prefetchConversation]);

  return (
    <>
      {children}
      
      {/* Transition overlay */}
      <AnimatePresence>
        {transition.isAnimating && transition.sourceRect && (
          <motion.div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Backdrop blur */}
            <motion.div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            {/* Expanding card */}
            <motion.div
              className="absolute bg-background rounded-2xl shadow-2xl overflow-hidden border border-border"
              initial={{
                left: transition.sourceRect.left,
                top: transition.sourceRect.top,
                width: transition.sourceRect.width,
                height: transition.sourceRect.height,
                borderRadius: 16,
              }}
              animate={{
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                borderRadius: 0,
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 35,
                duration: 0.3,
              }}
            >
              {/* Chat header preview */}
              <motion.div
                className="flex items-center gap-3 p-4 border-b border-border bg-background"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={transition.targetAvatarUrl || undefined} />
                  <AvatarFallback>
                    {(transition.targetDisplayName || transition.targetUsername)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">
                    {transition.targetDisplayName || transition.targetUsername}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{transition.targetUsername}
                  </p>
                </div>
              </motion.div>
              
              {/* Message skeleton placeholders */}
              <motion.div
                className="flex-1 p-4 space-y-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.2 }}
              >
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
                    <div 
                      className={`rounded-2xl px-4 py-2 max-w-[70%] ${
                        i % 2 === 0 ? 'bg-primary/20' : 'bg-muted'
                      }`}
                      style={{ width: `${50 + Math.random() * 30}%` }}
                    >
                      <div className="h-4 bg-foreground/10 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </motion.div>
              
              {/* Input bar placeholder */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background"
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-10 bg-muted rounded-full" />
                  <div className="h-10 w-10 bg-primary/30 rounded-full" />
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
});

export default NotificationToChatTransition;
