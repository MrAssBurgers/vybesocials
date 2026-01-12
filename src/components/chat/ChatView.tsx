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
import { useUnsendForEveryone, useDeleteForMe, useEditMessage } from '@/hooks/useMessageActions';
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
import { DailyCallButtons } from './DailyCallButtons';
import { SwipeToReply } from './SwipeToReply';
import { MessageActionMenu } from './MessageActionMenu';
import { ReplyPreview } from './ReplyPreview';
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
  CornerUpLeft,
  Trash2,
  Edit3,
  MoreHorizontal
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
  const unsendForEveryone = useUnsendForEveryone();
  const deleteForMe = useDeleteForMe();
  const editMessage = useEditMessage();
  const { typingUsers, setTyping } = useTypingIndicator(conversationId);
  const { notifyScreenshot } = useScreenshotNotification(conversationId);
  
  const { settings } = useDMSettings(conversationId);

  const [messageText, setMessageText] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('permanent');
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; file: File } | null>(null);
  const uploadingRef = useRef(false); // Prevent double uploads
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
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

  // Send media message helper
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

  // Compress image before upload for better mobile performance
  const compressImage = useCallback(async (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new window.Image();
      
      img.onload = () => {
        // Max dimensions for chat images
        const maxWidth = 1200;
        const maxHeight = 1200;
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => resolve(blob || file),
          'image/jpeg',
          0.85 // Quality
        );
      };
      
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId || !profile?.id) return;

    // Prevent double uploads
    if (uploadingRef.current) return;
    uploadingRef.current = true;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      uploadingRef.current = false;
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      uploadingRef.current = false;
      return;
    }

    // Create optimistic preview immediately
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ url: previewUrl, file });
    setIsUploadingMedia(true);

    try {
      // Compress image for faster upload
      const compressedBlob = await compressImage(file);
      const fileExt = file.type === 'image/png' ? 'png' : 'jpg';
      const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, compressedBlob, {
          contentType: `image/${fileExt}`,
          cacheControl: '31536000', // 1 year cache
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      await sendMediaMessage(publicUrl, 'image');
      
      // Clean up preview
      URL.revokeObjectURL(previewUrl);
      setPendingImage(null);
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image. Tap to retry.');
      // Keep preview for retry
    } finally {
      setIsUploadingMedia(false);
      uploadingRef.current = false;
    }
  }, [conversationId, profile?.id, profile?.user_id, compressImage, sendMediaMessage]);

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


  // Handle direct file selection (from Toybox)
  const handleDirectImageSelect = useCallback(async (file: File) => {
    if (!file || !conversationId || !profile?.id) return;
    if (uploadingRef.current) return;
    uploadingRef.current = true;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      uploadingRef.current = false;
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      uploadingRef.current = false;
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ url: previewUrl, file });
    setIsUploadingMedia(true);

    try {
      const compressedBlob = await compressImage(file);
      const fileExt = file.type === 'image/png' ? 'png' : 'jpg';
      const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, compressedBlob, {
          contentType: `image/${fileExt}`,
          cacheControl: '31536000',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      await sendMediaMessage(publicUrl, 'image');
      URL.revokeObjectURL(previewUrl);
      setPendingImage(null);
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image. Tap to retry.');
    } finally {
      setIsUploadingMedia(false);
      uploadingRef.current = false;
    }
  }, [conversationId, profile?.id, profile?.user_id, compressImage, sendMediaMessage]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, []);

  const clearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Memoize message items to prevent re-renders - using stable keys
  // Enhanced spacing logic for Instagram/iMessage quality
  const messageItems = useMemo(() => {
    if (!messages) return [];
    return messages.map((message, index) => {
      const isOwn = message.sender_id === profile?.id;
      const prevMessage = index > 0 ? messages[index - 1] : null;
      const showAvatar = !isOwn && (
        index === 0 || 
        prevMessage?.sender_id !== message.sender_id
      );
      const showTimestamp = index === 0 || 
        new Date(message.created_at).getTime() - new Date(prevMessage?.created_at || 0).getTime() > 5 * 60 * 1000;

      // Determine spacing type for airy layout
      const sameSender = prevMessage && prevMessage.sender_id === message.sender_id;
      const isMediaMessage = message.media_url && (message.media_type === 'image' || message.media_type === 'gif');
      const prevIsMedia = prevMessage?.media_url && (prevMessage.media_type === 'image' || prevMessage.media_type === 'gif');
      const isMediaTransition = (isMediaMessage && !prevIsMedia) || (!isMediaMessage && prevIsMedia);
      
      // Emoji-only detection
      const isEmojiOnly = message.content && !message.media_url && /^[\p{Emoji}\s]+$/u.test(message.content.trim()) && message.content.trim().length <= 8;

      return { message, isOwn, showAvatar, showTimestamp, sameSender, isMediaTransition, isEmojiOnly };
    });
  }, [messages, profile?.id]);

  // Navigate to profile when avatar clicked
  const handleAvatarClick = useCallback(() => {
    if (otherMember?.username) {
      navigate(`/u/${otherMember.username}`);
    }
  }, [otherMember?.username, navigate]);

  // Get chat wallpaper background class
  const getWallpaperClass = useCallback(() => {
    switch (settings.chat_wallpaper) {
      case 'gradient-1': return 'bg-gradient-to-br from-orange-400/20 to-pink-500/20';
      case 'gradient-2': return 'bg-gradient-to-br from-blue-400/20 to-cyan-500/20';
      case 'gradient-3': return 'bg-gradient-to-br from-green-400/20 to-emerald-600/20';
      case 'gradient-4': return 'bg-gradient-to-br from-indigo-900/30 to-purple-900/30';
      case 'gradient-5': return 'bg-gradient-to-br from-pink-500/20 via-purple-500/20 to-indigo-500/20';
      default: return '';
    }
  }, [settings.chat_wallpaper]);

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
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Header - fixed height, compact on mobile */}
      <header className="flex-shrink-0 h-14 sm:h-16 px-2 sm:px-4 border-b border-border flex items-center gap-2 sm:gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')} className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        {/* Clickable Avatar - navigates to profile - snug ring that fits perfectly */}
        <button 
          onClick={handleAvatarClick}
          className="relative flex-shrink-0 group"
          aria-label="View profile"
        >
          <div className="relative h-9 w-9 sm:h-10 sm:w-10">
            {/* Ring - exactly matches avatar container */}
            <div className="absolute inset-0 rounded-full ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all" />
            <Avatar className="h-full w-full group-active:scale-95 transition-transform">
              <AvatarImage src={otherMember?.avatar_url || undefined} />
              <AvatarFallback className="text-sm">{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </div>
          {!isGroupChat && (
            <OnlineIndicator isOnline={otherMemberOnline} size="sm" className="bottom-0 right-0" />
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm sm:text-base truncate leading-tight">{displayName}</h2>
          {!isGroupChat && !typingUsers.length && (
            <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
              {otherMemberOnline ? 'Online' : 'Offline'}
            </p>
          )}
          {typingUsers.length > 0 && (
            <p className="text-[11px] sm:text-xs text-primary flex items-center gap-1 leading-tight">
              <Sparkles className="h-3 w-3" />
              {t('messages.typing')}
            </p>
          )}
        </div>
        
        {!isGroupChat && otherMember?.id && (
          <DailyCallButtons
            conversationId={conversationId!}
            receiverId={otherMember.id}
          />
        )}
        
        {/* DM Feature Sheets - triggered from Toybox */}
        <VanishThreadsSheet conversationId={conversationId!} open={showVanishThreads} onOpenChange={setShowVanishThreads} />
        <MemoryPinsSheet conversationId={conversationId!} messages={messages || []} open={showMemoryPins} onOpenChange={setShowMemoryPins} />
        <ScheduleMessageSheet conversationId={conversationId!} open={showScheduleMessage} onOpenChange={setShowScheduleMessage} />
        <DMSettingsSheetControlled conversationId={conversationId!} open={showDMSettings} onOpenChange={setShowDMSettings} />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 bg-popover">
            <DropdownMenuItem onClick={handleAvatarClick}>{t('messages.viewProfile')}</DropdownMenuItem>
            <DropdownMenuItem>{t('messages.muteNotifications')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">{t('messages.blockUser')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages - scrollable area with Instagram/iMessage quality spacing */}
      <div className={cn(
        "flex-1 overflow-y-auto min-h-0",
        "px-1 sm:px-4 py-3 sm:py-4", // Minimal horizontal padding on mobile
        // Reduce blur on mobile for performance
        "sm:backdrop-blur-none",
        getWallpaperClass()
      )}>
        {/* Airy spacing between messages - never squished */}
        <div className="flex flex-col pb-20 sm:pb-24">
          {messageItems.map(({ message, isOwn, showAvatar, showTimestamp, sameSender, isMediaTransition, isEmojiOnly }, index) => {
            // Instagram/iMessage spacing rules:
            // Same sender consecutive: 8-10px (mb-2)
            // Different sender: 14-18px (mb-3.5 to mb-4)
            // Media ↔ text transitions: 18-22px (mb-5)
            const prevItem = index > 0 ? messageItems[index - 1] : null;
            const senderChanged = prevItem && prevItem.isOwn !== isOwn;
            
            // Calculate margin based on context
            let marginClass = 'mb-2'; // Default: same sender (8px)
            if (senderChanged) {
              marginClass = 'mb-3.5 sm:mb-4'; // Different sender (14-16px)
            }
            if (isMediaTransition || (prevItem && prevItem.isMediaTransition)) {
              marginClass = 'mb-5 sm:mb-5'; // Media transition (20px)
            }
            
            return (
              <div 
                key={message.id}
                className={cn(marginClass)}
              >
                {showTimestamp && (
                  <div className="text-center py-7 sm:py-8">
                    <span className="text-[10px] sm:text-xs text-muted-foreground/60 bg-muted/40 px-3.5 py-1.5 rounded-full font-medium tracking-wide">
                      {formatMessageDate(message.created_at)}
                    </span>
                  </div>
                )}
                {/* Swipe to reply wrapper */}
                <SwipeToReply onReply={() => handleReply(message)} isOwn={isOwn}>
                  <MessageBubble
                    message={message}
                    isOwn={isOwn}
                    showAvatar={showAvatar}
                    sender={message.sender}
                    isGroupChat={isGroupChat}
                    onView={() => markViewed.mutate(message.id)}
                    onReaction={handleReaction}
                    onReply={() => handleReply(message)}
                    onUnsendForEveryone={() => unsendForEveryone.mutate(message.id)}
                    onDeleteForMe={() => deleteForMe.mutate(message.id)}
                    onEdit={() => {
                      setEditingMessageId(message.id);
                      setEditText(message.content || '');
                    }}
                    allMessages={messages}
                    themeColor={THEME_COLORS[settings.theme] || THEME_COLORS.default}
                    showReactions={activeReactionMessageId === message.id}
                    onToggleReactions={() => setActiveReactionMessageId(
                      activeReactionMessageId === message.id ? null : message.id
                    )}
                    profileId={profile?.id}
                    isEmojiOnly={isEmojiOnly}
                  />
                </SwipeToReply>
              </div>
            );
          })}

          {optimisticMessages.map((optMsg) => (
            <OptimisticMessageBubble
              key={optMsg.tempId}
              message={optMsg}
              onRetry={() => retry(optMsg.tempId)}
              onDismiss={() => dismiss(optMsg.tempId)}
            />
          ))}

          {/* Pending image upload preview */}
          {pendingImage && (
            <div className="flex justify-end mb-3">
              <div className="relative max-w-[75%] rounded-2xl overflow-hidden">
                <img 
                  src={pendingImage.url} 
                  alt="Uploading..." 
                  className="max-w-full max-h-64 object-cover rounded-2xl opacity-70"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  {isUploadingMedia ? (
                    <Loader2 className="h-8 w-8 text-white animate-spin" />
                  ) : (
                    <button
                      onClick={() => {
                        // Retry logic - re-trigger the upload
                        if (pendingImage.file) {
                          const event = { target: { files: [pendingImage.file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
                          handleImageSelect(event);
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-destructive text-destructive-foreground rounded-lg"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Typing indicator - proper z-index */}
          {typingUsers.length > 0 && (
            <div className="flex items-start gap-1.5 max-w-[80%] relative z-10 mb-2 pl-0">
              <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                <AvatarImage src={otherMember?.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{otherMember?.username?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="bg-muted/70 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-primary rounded-full"
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

          <div ref={messagesEndRef} className="h-1" />
        </div>
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
            sendMediaMessage={sendMediaMessage}
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
          sendMediaMessage={sendMediaMessage}
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
  sendMediaMessage,
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
  sendMediaMessage: (mediaUrl: string, mediaType: string) => Promise<void>;
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
    <div className="flex-shrink-0 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-background sticky bottom-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />

        {/* Reply preview - compact on mobile */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-2 py-1.5 sm:px-3 sm:py-2 mb-2 bg-muted/50 rounded-lg border-l-2 border-primary">
            <CornerUpLeft className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] sm:text-xs text-primary font-medium leading-tight">
                Replying to {replyingTo.sender?.username || 'message'}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate leading-tight">
                {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '🎤 Voice message')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0"
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
          <div className="flex items-center gap-1 sm:gap-2">
            <Toybox
              onImageSelect={async (file) => {
                const dt = new DataTransfer();
                dt.items.add(file);
                handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
              }}
              onVideoSelect={async (file) => {
                const dt = new DataTransfer();
                dt.items.add(file);
                handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
              }}
              onGifSelect={async (gifUrl) => {
                await sendMediaMessage(gifUrl, 'gif');
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
                <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9">
                  {viewMode === 'view_once' ? (
                    <EyeOff className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                  ) : viewMode === '24h' ? (
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
                  ) : (
                    <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
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
              className="flex-1 h-9 sm:h-10 text-sm"
            />

            {!messageText.trim() ? (
              <Button 
                variant="ghost"
                size="icon"
                onClick={() => setIsRecordingVoice(true)}
                className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9"
              >
                <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            ) : (
              <Button 
                onClick={handleSend}
                disabled={!messageText.trim() || isPending}
                size="icon"
                className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 sm:h-5 sm:w-5" />
                )}
              </Button>
            )}
          </div>
        )}

        {viewMode !== 'permanent' && !isRecordingVoice && (
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 text-center">
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
  onUnsendForEveryone,
  onDeleteForMe,
  onEdit,
  allMessages,
  themeColor = { bubble: 'bg-primary', text: 'text-primary-foreground' },
  showReactions,
  onToggleReactions,
  profileId,
  isEmojiOnly = false,
}: { 
  message: Message;
  isOwn: boolean;
  showAvatar: boolean;
  sender?: Message['sender'];
  isGroupChat?: boolean;
  onView: () => void;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: () => void;
  onUnsendForEveryone: () => void;
  onDeleteForMe: () => void;
  onEdit?: () => void;
  allMessages?: Message[];
  themeColor?: { bubble: string; text: string };
  showReactions: boolean;
  onToggleReactions: () => void;
  profileId?: string;
  isEmojiOnly?: boolean;
}) {
  const [isViewed, setIsViewed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const menuOpenedRef = useRef(false);

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
  
  // Deduplicate reactions - one per user, show unique emojis only
  const uniqueReactions = useMemo(() => {
    const reactions = message.reactions || [];
    const userReactionMap = new Map<string, string>();
    
    // Keep only the latest reaction per user
    reactions.forEach(r => {
      userReactionMap.set(r.user_id, r.emoji);
    });
    
    // Get unique emojis with counts
    const emojiCounts = new Map<string, number>();
    userReactionMap.forEach(emoji => {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
    });
    
    return Array.from(emojiCounts.entries()).slice(0, 3); // Max 3 unique emojis shown
  }, [message.reactions]);

  // Check if current user already reacted
  const userReaction = useMemo(() => {
    if (!profileId) return null;
    return message.reactions?.find(r => r.user_id === profileId)?.emoji || null;
  }, [message.reactions, profileId]);

  const handleReaction = useCallback((emoji: string) => {
    // Replace reaction if user already reacted
    onReaction(message.id, emoji);
    onToggleReactions();
  }, [message.id, onReaction, onToggleReactions]);

  const handleUnsend = useCallback(() => {
    onUnsendForEveryone();
    setShowContextMenu(false);
  }, [onUnsendForEveryone]);

  // Long press handlers for context menu
  const handleTouchStart = useCallback(() => {
    if (menuOpenedRef.current) return;
    longPressRef.current = setTimeout(() => {
      if (!menuOpenedRef.current) {
        menuOpenedRef.current = true;
        setShowContextMenu(true);
      }
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (showContextMenu) {
      const handleClickOutside = () => {
        setShowContextMenu(false);
        menuOpenedRef.current = false;
      };
      
      const timeout = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, { once: true });
      }, 100);
      
      return () => {
        clearTimeout(timeout);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showContextMenu]);

  const copyToClipboard = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
      toast.success('Copied to clipboard');
    }
    setShowContextMenu(false);
    menuOpenedRef.current = false;
  }, [message.content]);

  // Check if this is an audio message for proper sizing
  const isAudioMessage = message.media_url && message.media_type === 'audio';
  const isMediaMessage = message.media_url && (message.media_type === 'image' || message.media_type === 'gif');

  return (
    <div className={cn(
      'flex gap-1.5 sm:gap-2 group/message relative w-full',
      isOwn ? 'justify-end pr-0 pl-8 sm:pl-12' : 'justify-start pl-0 pr-8 sm:pr-12'
    )}>
      {/* Reply button - left side for received messages */}
      {!isOwn && (
        <button
          onClick={onReply}
          className="self-center opacity-0 group-hover/message:opacity-100 transition-opacity p-1.5 rounded-full hover:bg-muted order-2"
        >
          <Reply className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        </button>
      )}

      {!isOwn && showAvatar && (
        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 ring-1 ring-background shadow-sm self-end ml-0">
          <AvatarImage src={sender?.avatar_url || undefined} />
          <AvatarFallback className="text-xs">{sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      {!isOwn && !showAvatar && <div className="w-7 sm:w-8 flex-shrink-0" />}

      <div className={cn('max-w-[80%] sm:max-w-[70%] flex flex-col relative', isOwn ? 'items-end' : 'items-start')}>
        {repliedMessage && (
          <div
            className={cn(
              "text-[10px] sm:text-xs px-3 py-2 sm:px-3.5 sm:py-2 rounded-t-xl mb-0.5 max-w-full",
              isOwn 
                ? "bg-primary/20 text-primary-foreground/80 rounded-br-xl" 
                : "bg-muted/60 text-muted-foreground rounded-bl-xl"
            )}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <CornerUpLeft className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              <span className="font-medium">{repliedMessage.sender?.username || 'Message'}</span>
            </div>
            <p className="truncate opacity-80">
              {repliedMessage.content || (repliedMessage.media_type === 'image' ? '📷 Photo' : '🎤 Voice')}
            </p>
          </div>
        )}

        <div
          className={cn(
            'relative rounded-2xl break-words select-none',
            // Proper padding: 12px vertical, 16px horizontal for text bubbles
            isEmojiOnly 
              ? 'px-3 py-1.5 sm:px-3.5 sm:py-2' // Reduced padding for emoji
              : isMediaMessage
                ? 'p-2 sm:p-2.5' // Media bubbles: 8-10px inner padding
                : 'px-4 py-3 sm:px-4 sm:py-3', // Text bubbles: 12px vertical, 16px horizontal
            isOwn 
              ? `${themeColor.bubble} ${themeColor.text} rounded-br-md` 
              : 'bg-muted/60 text-foreground rounded-bl-md',
            message.view_mode === 'view_once' && 'bg-gradient-to-r from-orange-500 to-pink-500 text-white',
            message.view_mode === '24h' && isOwn && 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
            repliedMessage && 'rounded-t-md'
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onDoubleClick={onToggleReactions}
        >
          {isMediaMessage && (
            <div className={message.content ? "mb-2" : ""}>
              <img
                src={message.media_url}
                alt={message.media_type === 'gif' ? "GIF" : "Shared image"}
                className="rounded-xl max-w-full max-h-52 sm:max-h-64 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Voice notes: auto-height with min-height 48px, max width 80% */}
          {isAudioMessage && (
            <div className="min-w-[180px] max-w-[80%] min-h-[48px]">
              <AudioMessage src={message.media_url} isOwn={isOwn} />
            </div>
          )}

          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <p className="text-[13px] sm:text-sm italic opacity-75 leading-relaxed">Message viewed</p>
          ) : message.content ? (
            <p className={cn(
              "whitespace-pre-wrap leading-[1.45]",
              isEmojiOnly 
                ? "text-2xl sm:text-3xl" // Larger font for emoji-only
                : "text-[14px] sm:text-[15px]" // Slightly larger for readability
            )}>{message.content}</p>
          ) : null}

          {message.view_mode !== 'permanent' && (
            <div className="flex items-center gap-1 mt-1.5 opacity-75">
              {message.view_mode === 'view_once' ? (
                <EyeOff className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              ) : (
                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              )}
              <span className="text-[9px] sm:text-[10px]">
                {message.view_mode === 'view_once' ? 'View once' : '24h'}
              </span>
            </div>
          )}

          {/* Reactions bar - floats 6-8px below message, capped at 3 visible */}
          {uniqueReactions.length > 0 && (
            <div className="absolute -bottom-3 left-2 flex items-center gap-0.5 bg-background/95 border border-border/50 rounded-full px-1.5 py-0.5 shadow-sm">
              {uniqueReactions.slice(0, 3).map(([emoji, count]) => (
                <span key={emoji} className="text-[11px] sm:text-xs flex items-center">
                  {emoji}
                  {count > 1 && <span className="text-[9px] ml-0.5 text-muted-foreground">{count}</span>}
                </span>
              ))}
              {uniqueReactions.length > 3 && (
                <span className="text-[9px] text-muted-foreground ml-0.5">+{uniqueReactions.length - 3}</span>
              )}
            </div>
          )}
        </div>

        {/* Timestamp and read receipts - 4-6px below bubble, lower opacity */}
        <div className={cn(
          "flex items-center gap-1 mt-1.5 sm:mt-1.5",
          isOwn ? "justify-end" : "justify-start"
        )}>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground/60">
            {format(new Date(message.created_at), 'HH:mm')}
          </span>
          {isOwn && (
            <>
              {hasBeenViewed ? (
                <div className="flex items-center gap-0.5">
                  <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary/70" />
                  {message.views && message.views.length > 0 && (
                    <span className="text-[9px] sm:text-[10px] font-medium text-primary/70">
                      {message.views.length}
                    </span>
                  )}
                </div>
              ) : (
                <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground/50" />
              )}
            </>
          )}
        </div>
        
        {hasBeenViewed && message.views && isGroupChat && isOwn && (
          <ReadReceipts 
            views={message.views} 
            isGroupChat={isGroupChat}
          />
        )}

        {/* Quick reactions popup */}
        {showReactions && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-background border border-border rounded-full px-2 py-1 shadow-lg flex gap-1 z-20 animate-in fade-in zoom-in-95 duration-150">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReaction(emoji)}
                className={cn(
                  "p-1 hover:scale-125 transition-transform text-base sm:text-lg",
                  userReaction === emoji && "bg-primary/20 rounded-full"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        {/* Context menu for long-press */}
        {showContextMenu && (
          <div 
            className="absolute top-full mt-1 left-1/2 -translate-x-1/2 bg-background border border-border rounded-xl shadow-xl z-30 min-w-[140px] py-1 animate-in fade-in slide-in-from-top-2 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { onToggleReactions(); setShowContextMenu(false); menuOpenedRef.current = false; }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            >
              <span>😀</span> React
            </button>
            <button
              onClick={() => { onReply(); setShowContextMenu(false); menuOpenedRef.current = false; }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
            >
              <Reply className="h-4 w-4" /> Reply
            </button>
            {message.content && (
              <button
                onClick={copyToClipboard}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
              >
                <Check className="h-4 w-4" /> Copy
              </button>
            )}
            {isOwn && (
              <button
                onClick={handleUnsend}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted text-destructive flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" /> Unsend
              </button>
            )}
            <button
              onClick={() => { onDeleteForMe(); setShowContextMenu(false); menuOpenedRef.current = false; }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted text-muted-foreground flex items-center gap-2"
            >
              <X className="h-4 w-4" /> Delete for me
            </button>
          </div>
        )}
      </div>

      {/* Action buttons - right side for own messages + delete for all messages */}
      <div className="self-center flex items-center gap-0.5 opacity-0 group-hover/message:opacity-100 transition-opacity">
        {isOwn && (
          <>
            <button
              onClick={onReply}
              className="p-1.5 rounded-full hover:bg-muted"
              title="Reply"
            >
              <Reply className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
            </button>
            <button
              onClick={handleUnsend}
              className="p-1.5 rounded-full hover:bg-destructive/10"
              title="Unsend message"
            >
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </>
        )}
        {/* Delete for me button - shown for all messages */}
        <button
          onClick={onDeleteForMe}
          className="p-1.5 rounded-full hover:bg-destructive/10"
          title="Delete for me"
        >
          <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo - prevent unnecessary re-renders
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.showReactions === nextProps.showReactions &&
    prevProps.profileId === nextProps.profileId &&
    JSON.stringify(prevProps.message.reactions) === JSON.stringify(nextProps.message.reactions) &&
    JSON.stringify(prevProps.message.views) === JSON.stringify(nextProps.message.views)
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
    <div className="flex justify-end gap-2 sm:gap-2.5 mb-2">
      <div className="max-w-[75%] sm:max-w-[70%] flex flex-col items-end">
        <div
          className={cn(
            'relative rounded-2xl px-4 py-3 sm:px-4 sm:py-3 break-words rounded-br-md',
            isFailed
              ? 'bg-destructive/20 text-destructive border border-destructive/30'
              : 'bg-primary/70 text-primary-foreground',
            isSending && 'opacity-70'
          )}
        >
          <p className="text-[14px] sm:text-[15px] whitespace-pre-wrap leading-[1.45]">{message.content}</p>
        </div>

        <div className="flex items-center gap-1.5 mt-1.5">
          {isSending && (
            <div className="flex items-center gap-1 text-muted-foreground/60">
              <Loader2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 animate-spin" />
              <span className="text-[9px] sm:text-[10px]">Sending...</span>
            </div>
          )}

          {isFailed && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] sm:text-[10px] text-destructive">Failed</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 sm:h-6 sm:w-6"
                onClick={onRetry}
              >
                <RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 sm:h-6 sm:w-6"
                onClick={onDismiss}
              >
                <X className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
