import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useMessages, 
  useSendMessage, 
  useTypingIndicator, 
  useScreenshotNotification,
  useMarkMessageViewed,
  useAddReaction,
  ViewMode,
  Message 
} from '@/hooks/useMessages';
import { useConversations } from '@/hooks/useMessages';
import { useAuth } from '@/lib/auth';
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
import { 
  ArrowLeft, 
  Send, 
  Image as ImageIcon, 
  Smile, 
  MoreVertical,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Check,
  CheckCheck
} from 'lucide-react';
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export function ChatView() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  
  const { data: conversations } = useConversations();
  const { data: messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
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

  const conversation = conversations?.find((c) => c.id === conversationId);
  const otherMembers = conversation?.members?.filter((m) => m.user_id !== profile?.id) || [];
  const otherMember = otherMembers[0]?.profile;
  const displayName = conversation?.is_group
    ? conversation.name
    : otherMember?.display_name || otherMember?.username || 'Chat';

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Screenshot detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'PrintScreen') || (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4'))) {
        notifyScreenshot();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // User might be taking screenshot via system
        // This is a heuristic, not perfect
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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

  const handleSend = async () => {
    if (!messageText.trim() || !conversationId) return;

    const text = messageText.trim();
    setMessageText('');
    setTyping(false);

    try {
      await sendMessage.mutateAsync({
        conversationId,
        content: text,
        viewMode,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(text); // Restore on error
    }
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
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className="h-12 w-48 rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={otherMember?.avatar_url || undefined} />
          <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h2 className="font-semibold">{displayName}</h2>
          {typingUsers.length > 0 && (
            <p className="text-xs text-primary animate-pulse">{t('messages.typing')}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>{t('messages.viewProfile')}</DropdownMenuItem>
            <DropdownMenuItem>{t('messages.muteNotifications')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">{t('messages.blockUser')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
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
                  <div className="text-center text-xs text-muted-foreground my-4">
                    {formatMessageDate(message.created_at)}
                  </div>
                )}
                <MessageBubble
                  message={message}
                  isOwn={isOwn}
                  showAvatar={showAvatar}
                  sender={message.sender}
                  onView={() => markViewed.mutate(message.id)}
                  onReaction={(emoji) => handleReaction(message.id, emoji)}
                />
              </div>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={otherMember?.avatar_url || undefined} />
              <AvatarFallback>{otherMember?.username?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="bg-muted rounded-2xl px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="flex-shrink-0">
            <ImageIcon className="h-5 w-5" />
          </Button>

          {/* View Mode Selector */}
          <DropdownMenu open={showViewModeMenu} onOpenChange={setShowViewModeMenu}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                {viewMode === 'view_once' ? (
                  <EyeOff className="h-5 w-5 text-orange-500" />
                ) : viewMode === '24h' ? (
                  <Clock className="h-5 w-5 text-yellow-500" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </Button>
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
            className="flex-1"
          />

          <Button 
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessage.isPending}
            size="icon"
            className="flex-shrink-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        {viewMode !== 'permanent' && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {viewMode === 'view_once' ? t('messages.viewOnceHint') : t('messages.24hoursHint')}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar,
  sender,
  onView,
  onReaction,
}: { 
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  sender?: Message['sender'];
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
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}
    >
      {!isOwn && showAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={sender?.avatar_url || undefined} />
          <AvatarFallback>{sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      {!isOwn && !showAvatar && <div className="w-8" />}

      <div className={cn('max-w-[75%] group', isOwn ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2 break-words',
            isOwn 
              ? 'bg-primary text-primary-foreground rounded-br-md' 
              : 'bg-muted text-foreground rounded-bl-md',
            message.view_mode === 'view_once' && 'bg-gradient-to-r from-orange-500 to-pink-500 text-white',
            message.view_mode === '24h' && isOwn && 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white'
          )}
          onDoubleClick={() => setShowReactions(!showReactions)}
        >
          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <p className="text-sm italic opacity-75">Message viewed</p>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}

          {/* View mode indicator */}
          {message.view_mode !== 'permanent' && (
            <div className="flex items-center gap-1 mt-1 opacity-75">
              {message.view_mode === 'view_once' ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              <span className="text-[10px]">
                {message.view_mode === 'view_once' ? 'View once' : '24h'}
              </span>
            </div>
          )}

          {/* Reactions */}
          {reactions.length > 0 && (
            <div className="absolute -bottom-3 left-2 flex gap-0.5 bg-background border border-border rounded-full px-1 py-0.5 shadow-sm">
              {[...new Set(reactions.map((r) => r.emoji))].map((emoji) => (
                <span key={emoji} className="text-xs">{emoji}</span>
              ))}
            </div>
          )}
        </div>

        {/* Message status for own messages */}
        {isOwn && (
          <div className="flex items-center gap-1 mt-1 justify-end">
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(message.created_at), 'HH:mm')}
            </span>
            {hasBeenViewed ? (
              <CheckCheck className="h-3 w-3 text-primary" />
            ) : (
              <Check className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Quick reactions popup */}
        <AnimatePresence>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              className="absolute mt-1 bg-background border border-border rounded-full px-2 py-1 shadow-lg flex gap-1 z-10"
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReaction(emoji);
                    setShowReactions(false);
                  }}
                  className="hover:scale-125 transition-transform p-1"
                >
                  {emoji}
                </button>
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
