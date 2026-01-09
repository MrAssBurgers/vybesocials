import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
import { VoiceRecorder, AudioMessage } from './VoiceRecorder';
import { EmotionalPulseIndicator } from './DMSettingsSheet';
import { VanishThreadsSheet } from './VanishThreadsSheet';
import { MemoryPinsSheet } from './MemoryPinsSheet';
import { ScheduleMessageSheet } from './ScheduleMessageSheet';
import { DMSettingsSheetControlled } from './DMSettingsSheetControlled';
import { useDMSettings, useMessagePins } from '@/hooks/useDMSettings';
import { CallButtons } from './CallButtons';
import { useCallContext } from './CallProvider';
import { 
  ArrowLeft, 
  Send, 
  MoreVertical,
  Clock,
  Eye,
  EyeOff,
  Check,
  RefreshCw,
  X,
  Loader2,
  Sparkles,
  Mic,
  Reply,
  CornerUpLeft
} from 'lucide-react';
import { Toybox } from './Toybox';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { useUserOnlineStatus } from '@/hooks/usePresence';
import { DMSafetyGate } from './DMSafetyGate';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

// Theme color mapping - now includes both bubble and text classes
const THEME_COLORS: Record<string, { bubble: string; text: string }> = {
  default: { bubble: 'bg-primary', text: 'text-primary-foreground' },
  rose: { bubble: 'bg-rose-500', text: 'text-white' },
  amber: { bubble: 'bg-amber-500', text: 'text-white' },
  emerald: { bubble: 'bg-emerald-500', text: 'text-white' },
  violet: { bubble: 'bg-violet-500', text: 'text-white' },
  cyan: { bubble: 'bg-cyan-500', text: 'text-white' },
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
  const { startCall } = useCallContext();
  const { settings } = useDMSettings(conversationId);

  const [messageText, setMessageText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('permanent');
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  // DM Feature Sheet states
  const [showVanishThreads, setShowVanishThreads] = useState(false);
  const [showMemoryPins, setShowMemoryPins] = useState(false);
  const [showScheduleMessage, setShowScheduleMessage] = useState(false);
  const [showDMSettings, setShowDMSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasMarkedReadRef = useRef<Set<string>>(new Set());
  const lastReadSyncedForConversationRef = useRef<string | null>(null);
  const messageNotifsClearedForConversationRef = useRef<string | null>(null);

  const conversation = useMemo(() => 
    conversations?.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );
  
  const isGroupChat = conversation?.is_group || false;
  const otherMembers = useMemo(() => 
    conversation?.members?.filter((m) => m.user_id !== profile?.id) || [],
    [conversation?.members, profile?.id]
  );
  const otherMember = otherMembers[0]?.profile;
  const displayName = conversation?.is_group
    ? conversation.name
    : otherMember?.display_name || otherMember?.username || 'Chat';
  
  // Get online status for the other member (if DM)
  const presenceQuery = useUserOnlineStatus(
    !isGroupChat ? otherMember?.id : undefined
  );
  const otherMemberOnline = presenceQuery.data?.is_online ?? false;

  // Clear message notifications + clear the unread badge when opening a conversation
  useEffect(() => {
    if (!profile?.id || !conversationId) return;

    if (lastReadSyncedForConversationRef.current !== conversationId) {
      lastReadSyncedForConversationRef.current = conversationId;

      supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to set last_read_at:', error);
            return;
          }
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        });
    }

    if (messageNotifsClearedForConversationRef.current !== conversationId) {
      messageNotifsClearedForConversationRef.current = conversationId;

      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('type', 'message')
        .eq('read', false)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        });
    }
  }, [conversationId, profile?.id, queryClient]);

  // Auto-mark messages as read
  useEffect(() => {
    if (!messages || !profile?.id || !conversationId) return;

    const unreadMessages = messages.filter((msg) => {
      if (msg.sender_id === profile.id) return false;
      if (hasMarkedReadRef.current.has(msg.id)) return false;
      const hasMyView = msg.views?.some((v) => v.user_id === profile.id);
      return !hasMyView;
    });

    if (unreadMessages.length === 0) return;

    unreadMessages.forEach((msg) => {
      hasMarkedReadRef.current.add(msg.id);
      markViewed.mutate(msg.id);
    });
  }, [messages, profile?.id, conversationId, markViewed]);

  // Scroll to bottom - use auto instead of smooth for better performance
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages?.length, optimisticMessages.length]);

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

  // Handle typing indicator - debounced
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

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !conversationId) return;

    const text = messageText.trim();
    setMessageText('');
    setTyping(false);

    sendWithReply(text, viewMode, replyingTo?.id);
    setReplyingTo(null);
  }, [messageText, conversationId, viewMode, replyingTo, setTyping]);

  const sendWithReply = useCallback(async (content: string, viewMode: ViewMode, replyToId?: string) => {
    if (!profile?.id || !conversationId) return;
    
    const expiresAt = viewMode === '24h' 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: profile.id,
        content,
        view_mode: viewMode,
        expires_at: expiresAt,
        reply_to_id: replyToId,
      });

    if (error) {
      console.error('Failed to send message:', error);
      return;
    }

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [profile?.id, conversationId, queryClient]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleReaction = useCallback(async (messageId: string, emoji: string) => {
    try {
      await addReaction.mutateAsync({ messageId, emoji });
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  }, [addReaction]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId || !profile?.id) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploadingMedia(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      await sendMediaMessage(publicUrl, 'image');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingMedia(false);
    }
  }, [conversationId, profile?.id, profile?.user_id]);

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob) => {
    if (!conversationId || !profile?.id) return;

    setIsUploadingMedia(true);

    try {
      const fileName = `${profile.user_id}/${Date.now()}.webm`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      await sendMediaMessage(publicUrl, 'audio');
      setIsRecordingVoice(false);
    } catch (error) {
      console.error('Failed to upload voice message:', error);
      toast.error('Failed to upload voice message');
    } finally {
      setIsUploadingMedia(false);
    }
  }, [conversationId, profile?.id, profile?.user_id]);

  const sendMediaMessage = useCallback(async (mediaUrl: string, mediaType: string) => {
    if (!conversationId || !profile?.id) return;

    const expiresAt = viewMode === '24h' 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: profile.id,
        media_url: mediaUrl,
        media_type: mediaType,
        view_mode: viewMode,
        expires_at: expiresAt,
        reply_to_id: replyingTo?.id,
      });

    if (error) throw error;

    setReplyingTo(null);

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [conversationId, profile?.id, viewMode, replyingTo?.id, queryClient]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, []);

  const clearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Memoize message items to prevent re-renders
  const messageItems = useMemo(() => {
    if (!messages) return [];
    return messages.map((message, index) => {
      const isOwn = message.sender_id === profile?.id;
      const showAvatar = !isOwn && (
        index === 0 || 
        messages[index - 1]?.sender_id !== message.sender_id
      );
      const showTimestamp = index === 0 || 
        new Date(message.created_at).getTime() - new Date(messages[index - 1]?.created_at).getTime() > 5 * 60 * 1000;

      return { message, isOwn, showAvatar, showTimestamp };
    });
  }, [messages, profile?.id]);

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

  // Get chat wallpaper background class
  const getWallpaperClass = () => {
    switch (settings.chat_wallpaper) {
      case 'gradient-1': return 'bg-gradient-to-br from-orange-400/20 to-pink-500/20';
      case 'gradient-2': return 'bg-gradient-to-br from-blue-400/20 to-cyan-500/20';
      case 'gradient-3': return 'bg-gradient-to-br from-green-400/20 to-emerald-600/20';
      case 'gradient-4': return 'bg-gradient-to-br from-indigo-900/30 to-purple-900/30';
      case 'gradient-5': return 'bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-indigo-500/20';
      default: return '';
    }
  };

  // Navigate to profile when avatar clicked
  const handleAvatarClick = useCallback(() => {
    if (otherMember?.username) {
      navigate(`/u/${otherMember.username}`);
    }
  }, [otherMember?.username, navigate]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header - sticky, contained */}
      <div className="flex-shrink-0 p-3 sm:p-4 border-b border-border flex items-center gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        {/* Clickable Avatar - navigates to profile */}
        <button 
          onClick={handleAvatarClick}
          className="relative flex-shrink-0 group"
          aria-label="View profile"
        >
          <Avatar className="h-10 w-10 ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all group-active:scale-95">
            <AvatarImage src={otherMember?.avatar_url || undefined} />
            <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          {!isGroupChat && (
            <OnlineIndicator isOnline={otherMemberOnline} size="sm" className="bottom-0 right-0" />
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{displayName}</h2>
          {!isGroupChat && !typingUsers.length && (
            <p className="text-xs text-muted-foreground">
              {otherMemberOnline ? 'Online' : 'Offline'}
            </p>
          )}
          {typingUsers.length > 0 && (
            <p className="text-xs text-primary flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {t('messages.typing')}
            </p>
          )}
        </div>
        
        {!isGroupChat && otherMember?.id && (
          <CallButtons
            conversationId={conversationId!}
            receiverId={otherMember.id}
            onCallStarted={startCall}
          />
        )}
        
        {/* DM Feature Sheets - triggered from Toybox */}
        <VanishThreadsSheet conversationId={conversationId!} open={showVanishThreads} onOpenChange={setShowVanishThreads} />
        <MemoryPinsSheet conversationId={conversationId!} messages={messages || []} open={showMemoryPins} onOpenChange={setShowMemoryPins} />
        <ScheduleMessageSheet conversationId={conversationId!} open={showScheduleMessage} onOpenChange={setShowScheduleMessage} />
        <DMSettingsSheetControlled conversationId={conversationId!} open={showDMSettings} onOpenChange={setShowDMSettings} />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="flex-shrink-0">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 bg-popover">
            <DropdownMenuItem onClick={handleAvatarClick}>{t('messages.viewProfile')}</DropdownMenuItem>
            <DropdownMenuItem>{t('messages.muteNotifications')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">{t('messages.blockUser')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className={cn("flex-1 overflow-y-auto p-4 space-y-4", getWallpaperClass())}>
        {messageItems.map(({ message, isOwn, showAvatar, showTimestamp }) => (
          <div key={message.id}>
            {showTimestamp && (
              <div className="text-center text-xs text-muted-foreground my-4">
                <span className="bg-muted/50 px-3 py-1 rounded-full">
                  {formatMessageDate(message.created_at)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              isOwn={isOwn}
              showAvatar={showAvatar}
              sender={message.sender}
              isGroupChat={isGroupChat}
              onView={() => markViewed.mutate(message.id)}
              onReaction={handleReaction}
              onReply={() => handleReply(message)}
              allMessages={messages}
              themeColor={THEME_COLORS[settings.theme] || THEME_COLORS.default}
            />
          </div>
        ))}

        {optimisticMessages.map((optMsg) => (
          <OptimisticMessageBubble
            key={optMsg.tempId}
            message={optMsg}
            onRetry={() => retry(optMsg.tempId)}
            onDismiss={() => dismiss(optMsg.tempId)}
          />
        ))}

        {/* Typing indicator - fixed z-index and positioning */}
        {typingUsers.length > 0 && (
          <div className="flex items-start gap-2 max-w-[85%] relative z-10">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarImage src={otherMember?.avatar_url || undefined} />
              <AvatarFallback>{otherMember?.username?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="bg-muted/80 backdrop-blur-sm rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 bg-primary rounded-full"
                    style={{ 
                      animation: 'bounce 0.6s infinite',
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area - wrapped with DM safety for non-group chats */}
      {!isGroupChat && otherMember?.id ? (
        <DMSafetyGate targetUserId={otherMember.id} targetUsername={otherMember.username || ''}>
          <MessageInputArea
            messageText={messageText}
            viewMode={viewMode}
            showViewModeMenu={showViewModeMenu}
            setShowViewModeMenu={setShowViewModeMenu}
            isRecordingVoice={isRecordingVoice}
            isUploadingMedia={isUploadingMedia}
            replyingTo={replyingTo}
            isPending={isPending}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
            handleInputChange={handleInputChange}
            handleKeyPress={handleKeyPress}
            handleSend={handleSend}
            handleImageSelect={handleImageSelect}
            handleVoiceRecordingComplete={handleVoiceRecordingComplete}
            setViewMode={setViewMode}
            setIsRecordingVoice={setIsRecordingVoice}
            clearReply={clearReply}
            t={t}
            onOpenVanishThreads={() => setShowVanishThreads(true)}
            onOpenMemoryPins={() => setShowMemoryPins(true)}
            onOpenScheduleMessage={() => setShowScheduleMessage(true)}
            onOpenDMSettings={() => setShowDMSettings(true)}
          />
        </DMSafetyGate>
      ) : (
        <MessageInputArea
          messageText={messageText}
          viewMode={viewMode}
          showViewModeMenu={showViewModeMenu}
          setShowViewModeMenu={setShowViewModeMenu}
          isRecordingVoice={isRecordingVoice}
          isUploadingMedia={isUploadingMedia}
          replyingTo={replyingTo}
          isPending={isPending}
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          handleInputChange={handleInputChange}
          handleKeyPress={handleKeyPress}
          handleSend={handleSend}
          handleImageSelect={handleImageSelect}
          handleVoiceRecordingComplete={handleVoiceRecordingComplete}
          setViewMode={setViewMode}
          setIsRecordingVoice={setIsRecordingVoice}
          clearReply={clearReply}
          t={t}
          onOpenVanishThreads={() => setShowVanishThreads(true)}
          onOpenMemoryPins={() => setShowMemoryPins(true)}
          onOpenScheduleMessage={() => setShowScheduleMessage(true)}
          onOpenDMSettings={() => setShowDMSettings(true)}
        />
      )}
    </div>
  );
}

// Extracted MessageInputArea component for reuse
const MessageInputArea = memo(function MessageInputArea({
  messageText,
  viewMode,
  showViewModeMenu,
  setShowViewModeMenu,
  isRecordingVoice,
  isUploadingMedia,
  replyingTo,
  isPending,
  inputRef,
  fileInputRef,
  handleInputChange,
  handleKeyPress,
  handleSend,
  handleImageSelect,
  handleVoiceRecordingComplete,
  setViewMode,
  setIsRecordingVoice,
  clearReply,
  t,
  onOpenVanishThreads,
  onOpenMemoryPins,
  onOpenScheduleMessage,
  onOpenDMSettings,
}: {
  messageText: string;
  viewMode: ViewMode;
  showViewModeMenu: boolean;
  setShowViewModeMenu: (open: boolean) => void;
  isRecordingVoice: boolean;
  isUploadingMedia: boolean;
  replyingTo: Message | null;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleInputChange: (value: string) => void;
  handleKeyPress: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleVoiceRecordingComplete: (blob: Blob) => void;
  setViewMode: (mode: ViewMode) => void;
  setIsRecordingVoice: (recording: boolean) => void;
  clearReply: () => void;
  t: (key: string) => string;
  onOpenVanishThreads?: () => void;
  onOpenMemoryPins?: () => void;
  onOpenScheduleMessage?: () => void;
  onOpenDMSettings?: () => void;
}) {
  return (
    <div className="p-4 border-t border-border bg-background">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />

        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-muted/50 rounded-lg border-l-2 border-primary">
            <CornerUpLeft className="h-4 w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-primary font-medium">
                Replying to {replyingTo.sender?.username || 'message'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '🎤 Voice message')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={clearReply}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        {isRecordingVoice ? (
          <VoiceRecorder
            onRecordingComplete={handleVoiceRecordingComplete}
            onCancel={() => setIsRecordingVoice(false)}
            isUploading={isUploadingMedia}
          />
        ) : (
          <div className="flex items-center gap-2">
            <Toybox
              onImageSelect={async (file) => {
                if (fileInputRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileInputRef.current.files = dt.files;
                  handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
                }
              }}
              onVideoSelect={async (file) => {
                if (fileInputRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileInputRef.current.files = dt.files;
                  handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
                }
              }}
              onGifSelect={(gifUrl) => {
                // Append GIF URL to message for now
                handleInputChange(messageText + (messageText ? ' ' : '') + gifUrl);
              }}
              onVoiceStart={() => setIsRecordingVoice(true)}
              isUploading={isUploadingMedia}
              onOpenVanishThreads={onOpenVanishThreads}
              onOpenMemoryPins={onOpenMemoryPins}
              onOpenScheduleMessage={onOpenScheduleMessage}
              onOpenDMSettings={onOpenDMSettings}
            />

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

            {!messageText.trim() ? (
              <Button 
                variant="ghost"
                size="icon"
                onClick={() => setIsRecordingVoice(true)}
                className="flex-shrink-0"
              >
                <Mic className="h-5 w-5" />
              </Button>
            ) : (
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
            )}
          </div>
        )}

        {viewMode !== 'permanent' && !isRecordingVoice && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {viewMode === 'view_once' ? t('messages.viewOnceHint') : t('messages.24hoursHint')}
          </p>
        )}
      </div>
    );
});

// Memoized MessageBubble to prevent unnecessary re-renders
const MessageBubble = memo(function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar,
  sender,
  isGroupChat,
  onView,
  onReaction,
  onReply,
  allMessages,
  themeColor = { bubble: 'bg-primary', text: 'text-primary-foreground' },
}: { 
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  sender?: Message['sender'];
  isGroupChat?: boolean;
  onView: () => void;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: () => void;
  allMessages?: Message[];
  themeColor?: { bubble: string; text: string };
}) {
  const [isViewed, setIsViewed] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const repliedMessage = useMemo(() => 
    message.reply_to_id ? allMessages?.find(m => m.id === message.reply_to_id) : null,
    [message.reply_to_id, allMessages]
  );

  useEffect(() => {
    if (!isOwn && message.view_mode === 'view_once' && !isViewed) {
      onView();
      setIsViewed(true);
    }
  }, [isOwn, message.view_mode, isViewed, onView]);

  const hasBeenViewed = message.views && message.views.length > 0;
  const reactions = message.reactions || [];

  const handleReaction = useCallback((emoji: string) => {
    onReaction(message.id, emoji);
    setShowReactions(false);
  }, [message.id, onReaction]);

  return (
    <div className={cn('flex gap-2 group/message', isOwn ? 'justify-end' : 'justify-start')}>
      {!isOwn && (
        <button
          onClick={onReply}
          className="self-center opacity-0 group-hover/message:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted"
        >
          <Reply className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {!isOwn && showAvatar && (
        <Avatar className="h-8 w-8 flex-shrink-0 ring-2 ring-background shadow-sm">
          <AvatarImage src={sender?.avatar_url || undefined} />
          <AvatarFallback>{sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      {!isOwn && !showAvatar && <div className="w-8" />}

      <div className={cn('max-w-[75%] group flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {repliedMessage && (
          <div
            className={cn(
              "text-xs px-3 py-1.5 rounded-t-lg mb-0.5 max-w-full",
              isOwn 
                ? "bg-primary/30 text-primary-foreground/80 rounded-br-lg" 
                : "bg-muted/80 text-muted-foreground rounded-bl-lg"
            )}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <CornerUpLeft className="h-3 w-3" />
              <span className="font-medium">{repliedMessage.sender?.username || 'Message'}</span>
            </div>
            <p className="truncate opacity-80">
              {repliedMessage.content || (repliedMessage.media_type === 'image' ? '📷 Photo' : '🎤 Voice')}
            </p>
          </div>
        )}

        <div
          className={cn(
            'relative rounded-2xl px-4 py-2 break-words shadow-sm cursor-pointer',
            isOwn 
              ? `${themeColor.bubble} ${themeColor.text} rounded-br-md` 
              : 'bg-muted text-foreground rounded-bl-md',
            message.view_mode === 'view_once' && 'bg-gradient-to-r from-orange-500 to-pink-500 text-white',
            message.view_mode === '24h' && isOwn && 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
            repliedMessage && 'rounded-t-md'
          )}
          onDoubleClick={() => setShowReactions(!showReactions)}
        >
          {message.media_url && message.media_type === 'image' && (
            <div className="mb-2">
              <img
                src={message.media_url}
                alt="Shared image"
                className="rounded-lg max-w-full max-h-64 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {message.media_url && message.media_type === 'audio' && (
            <div className="mb-2">
              <AudioMessage src={message.media_url} isOwn={isOwn} />
            </div>
          )}

          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <p className="text-sm italic opacity-75">Message viewed</p>
          ) : message.content ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : null}

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

          {reactions.length > 0 && (
            <div className="absolute -bottom-3 left-2 flex gap-0.5 bg-background border border-border rounded-full px-1.5 py-0.5 shadow-md">
              {[...new Set(reactions.map((r) => r.emoji))].map((emoji) => (
                <span key={emoji} className="text-xs">{emoji}</span>
              ))}
            </div>
          )}
        </div>

        {isOwn && (
          <div className="flex flex-col items-end mt-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
              {hasBeenViewed ? (
                <div className="flex items-center gap-0.5">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  {message.views && message.views.length > 0 && (
                    <span className="text-[10px] font-medium text-primary">
                      {message.views.length}
                    </span>
                  )}
                </div>
              ) : (
                <Check className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
            
            {hasBeenViewed && message.views && isGroupChat && (
              <ReadReceipts 
                views={message.views} 
                isGroupChat={isGroupChat}
              />
            )}
          </div>
        )}

        {showReactions && (
          <div className="absolute mt-1 bg-background border border-border rounded-full px-2 py-1 shadow-lg flex gap-1 z-10">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className="p-1 hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {isOwn && (
        <button
          onClick={onReply}
          className="self-center opacity-0 group-hover/message:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted"
        >
          <Reply className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
});

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) {
    return format(date, 'HH:mm');
  } else if (isYesterday(date)) {
    return `Yesterday ${format(date, 'HH:mm')}`;
  }
  return format(date, 'MMM d, HH:mm');
}

const OptimisticMessageBubble = memo(function OptimisticMessageBubble({
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
    <div className="flex justify-end gap-2">
      <div className="max-w-[75%] flex flex-col items-end">
        <div
          className={cn(
            'relative rounded-2xl px-4 py-2 break-words rounded-br-md shadow-sm',
            isFailed
              ? 'bg-destructive/20 text-destructive border border-destructive/30'
              : 'bg-primary/70 text-primary-foreground',
            isSending && 'opacity-70'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>

        <div className="flex items-center gap-2 mt-1">
          {isSending && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Sending...</span>
            </div>
          )}

          {isFailed && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-destructive">Failed to send</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={onRetry}
              >
                <RefreshCw className="h-3 w-3 text-destructive" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={onDismiss}
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
