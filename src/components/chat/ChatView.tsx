import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useMessages, 
  useTypingIndicator, 
  useScreenshotNotification,
  useMarkMessageViewed,
  useAddReaction,
  ViewMode,
  Message,
  useConversations
} from '@/hooks/useMessages';
import { useOptimisticMessages, OptimisticMessage } from '@/hooks/useOptimisticMessages';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ReadReceipts } from './ReadReceipts';
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  MoreVertical,
  Clock,
  Eye,
  EyeOff,
  Check,
  CheckCheck,
  RefreshCw,
  X,
  Loader2,
  Sparkles
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

// Animation variants
const messageVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.9 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }
};

const bubbleHover = {
  scale: 1.02,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
};

const reactionVariants = {
  hidden: { opacity: 0, scale: 0, y: 10 },
  visible: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 500, damping: 25 }
  },
  exit: { opacity: 0, scale: 0, y: 10, transition: { duration: 0.1 } }
};

const emojiPopVariants = {
  hidden: { scale: 0 },
  visible: (i: number) => ({
    scale: 1,
    transition: { 
      delay: i * 0.03,
      type: 'spring' as const, 
      stiffness: 600, 
      damping: 20 
    }
  }),
  hover: { scale: 1.3, rotate: [0, -10, 10, 0] }
};

export function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  const { data: conversations } = useConversations();
  const { data: messages, isLoading } = useMessages(conversationId);
  const { optimisticMessages, send, retry, dismiss, isPending } = useOptimisticMessages(conversationId);
  const markViewed = useMarkMessageViewed();
  const addReaction = useAddReaction();
  const { typingUsers, setTyping } = useTypingIndicator(conversationId);
  const { notifyScreenshot } = useScreenshotNotification(conversationId);

  const [messageText, setMessageText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('permanent');
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasMarkedReadRef = useRef<Set<string>>(new Set());

  const conversation = conversations?.find((c) => c.id === conversationId);
  const isGroupChat = conversation?.is_group || false;
  const otherMembers = conversation?.members?.filter((m) => m.user_id !== profile?.id) || [];
  const otherMember = otherMembers[0]?.profile;
  const displayName = conversation?.is_group
    ? conversation.name
    : otherMember?.display_name || otherMember?.username || 'Chat';

  // Auto-mark messages as read when viewing conversation
  useEffect(() => {
    if (!messages || !profile?.id || !conversationId) return;

    const unreadMessages = messages.filter(msg => {
      // Only mark messages from others as read
      if (msg.sender_id === profile.id) return false;
      // Check if we haven't already marked this one
      if (hasMarkedReadRef.current.has(msg.id)) return false;
      // Check if there's no view from us
      const hasMyView = msg.views?.some(v => v.user_id === profile.id);
      return !hasMyView;
    });

    if (unreadMessages.length > 0) {
      // Mark all unread messages as viewed
      unreadMessages.forEach(msg => {
        hasMarkedReadRef.current.add(msg.id);
        markViewed.mutate(msg.id);
      });

      // Also mark notifications as read for this conversation
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('type', 'message')
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        });
    }
  }, [messages, profile?.id, conversationId, markViewed, queryClient]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, optimisticMessages]);

  // Screenshot detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'PrintScreen') || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4'))) {
        notifyScreenshot();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [notifyScreenshot]);

  // Handle typing indicator
  const handleInputChange = useCallback((value: string) => {
    setMessageText(value);
    
    if (value.length > 0) {
      setTyping(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false);
      }, 3000);
    } else {
      setTyping(false);
    }
  }, [setTyping]);

  const handleSend = () => {
    if (!messageText.trim() || !conversationId) return;

    const text = messageText.trim();
    setMessageText('');
    setTyping(false);

    send(text, viewMode);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await addReaction.mutateAsync({ messageId, emoji });
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full animate-pulse" />
          <Skeleton className="h-5 w-32 animate-pulse" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
            >
              <Skeleton className="h-12 w-48 rounded-2xl" />
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header with bounce animation */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="p-4 border-b border-border flex items-center gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10"
      >
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.05 }} className="cursor-pointer">
          <Avatar className="h-10 w-10 ring-2 ring-primary/20">
            <AvatarImage src={otherMember?.avatar_url || undefined} />
            <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>
        <div className="flex-1">
          <h2 className="font-semibold">{displayName}</h2>
          <AnimatePresence mode="wait">
            {typingUsers.length > 0 && (
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs text-primary flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3 animate-pulse" />
                {t('messages.typing')}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div whileHover={{ rotate: 90 }} transition={{ duration: 0.2 }}>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t('messages.viewProfile')}</DropdownMenuItem>
            <DropdownMenuItem>{t('messages.muteNotifications')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">{t('messages.blockUser')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {/* Messages with stagger animation */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages?.map((message, index) => {
            const isOwn = message.sender_id === profile?.id;
            const showAvatar = !isOwn && (
              index === 0 || 
              messages[index - 1]?.sender_id !== message.sender_id
            );
            const showTimestamp = index === 0 || 
              new Date(message.created_at).getTime() - new Date(messages[index - 1]?.created_at).getTime() > 5 * 60 * 1000;

            return (
              <div key={message.id}>
                {showTimestamp && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center text-xs text-muted-foreground my-4"
                  >
                    <span className="bg-muted/50 px-3 py-1 rounded-full">
                      {formatMessageDate(message.created_at)}
                    </span>
                  </motion.div>
                )}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  sender={message.sender}
                  isGroupChat={isGroupChat}
                  onView={() => markViewed.mutate(message.id)}
                  onReaction={(emoji) => handleReaction(message.id, emoji)}
                />
              </div>
            );
          })}

          {/* Optimistic messages (sending/failed) */}
          {optimisticMessages.map((optMsg) => (
            <OptimisticMessageBubble
              key={optMsg.tempId}
              message={optMsg}
              onRetry={() => retry(optMsg.tempId)}
              onDismiss={() => dismiss(optMsg.tempId)}
            />
          ))}
        </AnimatePresence>

        {/* Typing indicator with fun animation */}
        <AnimatePresence>
          {typingUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              className="flex items-center gap-2"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={otherMember?.avatar_url || undefined} />
                  <AvatarFallback>{otherMember?.username?.charAt(0)}</AvatarFallback>
                </Avatar>
              </motion.div>
              <div className="bg-muted rounded-2xl px-4 py-2">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 bg-primary rounded-full"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ 
                        repeat: Infinity, 
                        duration: 0.6, 
                        delay: i * 0.15,
                        ease: 'easeInOut'
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input with slide-up animation */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="p-4 border-t border-border bg-background"
      >
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button variant="ghost" size="icon" className="flex-shrink-0">
              <ImageIcon className="h-5 w-5" />
            </Button>
          </motion.div>

          {/* View Mode Selector */}
          <DropdownMenu open={showViewModeMenu} onOpenChange={setShowViewModeMenu}>
            <DropdownMenuTrigger asChild>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  {viewMode === 'view_once' ? (
                    <EyeOff className="h-5 w-5 text-orange-500" />
                  ) : viewMode === '24h' ? (
                    <Clock className="h-5 w-5 text-yellow-500" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </Button>
              </motion.div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setViewMode('permanent')}>
                <Eye className="h-4 w-4 mr-2" />
                {t('messages.permanent')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('24h')}>
                <Clock className="h-4 w-4 mr-2 text-yellow-500" />
                {t('messages.24hours')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewMode('view_once')}>
                <EyeOff className="h-4 w-4 mr-2 text-orange-500" />
                {t('messages.viewOnce')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            ref={inputRef}
            value={messageText}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={t('messages.typeMessage')}
            className="flex-1 transition-all focus:ring-2 focus:ring-primary/20"
          />

          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9, rotate: 15 }}
          >
            <Button 
              onClick={handleSend}
              disabled={!messageText.trim() || isPending}
              size="icon"
              className="flex-shrink-0"
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </motion.div>
        </div>

        <AnimatePresence>
          {viewMode !== 'permanent' && (
            <motion.p 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-xs text-muted-foreground mt-2 text-center"
            >
              {viewMode === 'view_once' ? t('messages.viewOnceHint') : t('messages.24hoursHint')}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar,
  sender,
  isGroupChat,
  onView,
  onReaction,
}: { 
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  sender?: Message['sender'];
  isGroupChat?: boolean;
  onView: () => void;
  onReaction: (emoji: string) => void;
}) {
  const [isViewed, setIsViewed] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  useEffect(() => {
    if (!isOwn && message.view_mode === 'view_once' && !isViewed) {
      onView();
      setIsViewed(true);
    }
  }, [isOwn, message.view_mode, isViewed, onView]);

  const hasBeenViewed = message.views && message.views.length > 0;
  const reactions = message.reactions || [];

  return (
    <motion.div
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover={bubbleHover}
      className={cn('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}
    >
      {!isOwn && showAvatar && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
        >
          <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-background shadow-sm">
            <AvatarImage src={sender?.avatar_url || undefined} />
            <AvatarFallback>{sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </motion.div>
      )}
      {!isOwn && !showAvatar && <div className="w-8" />}

      <div className={cn('max-w-[75%] group', isOwn ? 'items-end' : 'items-start')}>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className={cn(
            'relative rounded-2xl px-4 py-2 break-words shadow-sm',
            isOwn 
              ? 'bg-primary text-primary-foreground rounded-br-md' 
              : 'bg-muted text-foreground rounded-bl-md',
            message.view_mode === 'view_once' && 'bg-gradient-to-r from-orange-500 to-pink-500 text-white',
            message.view_mode === '24h' && isOwn && 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white'
          )}
          onDoubleClick={() => setShowReactions(!showReactions)}
        >
          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm italic opacity-75"
            >
              Message viewed
            </motion.p>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}

          {/* View mode indicator */}
          {message.view_mode !== 'permanent' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              className="flex items-center gap-1 mt-1"
            >
              {message.view_mode === 'view_once' ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              <span className="text-[10px]">
                {message.view_mode === 'view_once' ? 'View once' : '24h'}
              </span>
            </motion.div>
          )}

          {/* Reactions with pop animation */}
          <AnimatePresence>
            {reactions.length > 0 && (
              <motion.div 
                variants={reactionVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="absolute -bottom-3 left-2 flex gap-0.5 bg-background border border-border rounded-full px-1.5 py-0.5 shadow-md"
              >
                {[...new Set(reactions.map((r) => r.emoji))].map((emoji, i) => (
                  <motion.span 
                    key={emoji} 
                    className="text-xs"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    {emoji}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Message status for own messages with read receipts */}
        {isOwn && (
          <div className="flex flex-col items-end mt-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500 }}
              >
                {hasBeenViewed ? (
                  <CheckCheck className="h-3 w-3 text-primary" />
                ) : (
                  <Check className="h-3 w-3 text-muted-foreground" />
                )}
              </motion.div>
            </div>
            
            {/* Read receipts for group chats - show who viewed */}
            {hasBeenViewed && message.views && (
              <ReadReceipts 
                views={message.views} 
                isGroupChat={isGroupChat}
              />
            )}
          </div>
        )}

        {/* Quick reactions popup with stagger animation */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className="absolute mt-1 bg-background border border-border rounded-full px-2 py-1 shadow-lg flex gap-1 z-10"
            >
              {QUICK_REACTIONS.map((emoji, i) => (
                <motion.button
                  key={emoji}
                  custom={i}
                  variants={emojiPopVariants}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                  onClick={() => {
                    onReaction(emoji);
                    setShowReactions(false);
                  }}
                  className="p-1"
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'HH:mm');
  } else if (isYesterday(date)) {
    return `Yesterday ${format(date, 'HH:mm')}`;
  }
  return format(date, 'MMM d, HH:mm');
}

function OptimisticMessageBubble({
  message,
  onRetry,
  onDismiss,
}: {
  message: OptimisticMessage;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const isFailed = message.status === 'failed';
  const isSending = message.status === 'sending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="flex justify-end gap-2"
    >
      <div className="max-w-[75%] flex flex-col items-end">
        <motion.div
          animate={isSending ? { opacity: [0.7, 1, 0.7] } : {}}
          transition={isSending ? { repeat: Infinity, duration: 1.5 } : {}}
          className={cn(
            'relative rounded-2xl px-4 py-2 break-words rounded-br-md shadow-sm',
            isFailed
              ? 'bg-destructive/20 text-destructive border border-destructive/30'
              : 'bg-primary/70 text-primary-foreground'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </motion.div>

        <div className="flex items-center gap-2 mt-1">
          {isSending && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1 text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Sending...</span>
            </motion.div>
          )}

          {isFailed && (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1"
            >
              <span className="text-[10px] text-destructive">Failed to send</span>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onRetry}
                >
                  <RefreshCw className="h-3 w-3 text-destructive" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onDismiss}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
