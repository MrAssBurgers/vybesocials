import { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  useMessages, 
  useScreenshotNotification,
  useMarkMessageViewed,
  useAddReaction,
  ViewMode,
  Message,
  useConversations
} from '@/hooks/useMessages';
import { useInstantSend } from '@/hooks/useInstantSend';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useUnsendForEveryone, useDeleteForMe, useEditMessage } from '@/hooks/useMessageActions';
import { useInstantReadClear } from '@/hooks/useMessageNotifications';
import { useAISmartReplies } from '@/hooks/useAIMessageAssist';
import { useScreenCapture } from '@/hooks/useScreenCapture';
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
import { CallButtons } from '@/components/call/CallButtons';
import { CallSettingsSheet } from '@/components/call/CallSettingsSheet';
import { useChatPresence } from '@/hooks/useChatPresence';
import { useLiveActivity } from '@/hooks/useLiveActivity';
import { ChatPresenceIndicator } from './ChatPresenceIndicator';
import { LivePresenceBar, SnapTypingBubble, ScreenshotAlert } from './SnapchatFeedback';
import { LiveActivityIndicator, InlineActivityBubble } from './LiveActivityIndicator';
import { AIAssistButton } from './AIAssistButton';
import { SmartRepliesBar } from './SmartRepliesBar';
import { ChatSummarySheet } from './ChatSummarySheet';
import { AdminPanelSheet } from './AdminPanelSheet';

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
  MoreHorizontal,
  Users,
  Settings,
  FileText,
  Camera,
  Play
} from 'lucide-react';
import { Toybox } from './Toybox';
import { SnapCamera } from './SnapCamera';
import { VybeViewer } from './VybeViewer';
import { VideoSendPreview } from './VideoSendPreview';
import { VideoBubble } from './VideoBubble';
import { VideoMessageViewer } from './VideoMessageViewer';
import { SharedPostBubble } from './SharedPostBubble';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { useUserOnlineStatus } from '@/hooks/usePresence';
import { DMSafetyGate } from './DMSafetyGate';
import { GroupInfoSheet } from './GroupInfoSheet';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { PrincessBadge, isOwnerWife } from '@/components/ui/PrincessBadge';
import { StreakIndicator } from './StreakIndicator';
import { useStreakWithUser } from '@/hooks/useStreaks';
import { DMImageSafetyGate } from './DMImageSafetyGate';

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
  const { sendText, sendMedia, sendVideo, retry: retryMessage, removeMessage, videoUploadProgress } = useInstantSend(conversationId);
  // Enable realtime sync for this conversation
  useRealtimeMessages(conversationId);
  const markViewed = useMarkMessageViewed();
  const addReaction = useAddReaction();
  const unsendForEveryone = useUnsendForEveryone();
  const deleteForMe = useDeleteForMe();
  const editMessage = useEditMessage();
  // Use new presence hook for Snapchat-style presence + typing
  const { presentUsers, typingUsers, setTyping } = useChatPresence(conversationId);
  // Ultra-fast live activity tracking for DMs
  const { 
    otherUserActivity, 
    isOtherUserPresent, 
    setTyping: setLiveTyping, 
    setRecordingVoice: setLiveRecordingVoice 
  } = useLiveActivity(conversationId);
  const { notifyScreenshot, notifyCapture, screenshotEvents, isRecording } = useScreenshotNotification(conversationId);
  
  // v1.1: Instant read clear - marks as read immediately and clears badges
  useInstantReadClear(conversationId);
  
  // Snapchat-style screen capture detection
  useScreenCapture({
    enabled: !!conversationId,
    onCapture: (event) => {
      console.log('[ChatView] Capture detected:', event);
      if (event.confidence !== 'low') {
        notifyCapture(event.type);
      }
    }
  });
  
  // v1.1: AI Smart Replies
  const { suggestions: smartReplies, generateReplies, clearSuggestions } = useAISmartReplies();
  
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
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showMediaSettings, setShowMediaSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSnapCamera, setShowSnapCamera] = useState(false);
  const [showScreenshotAlert, setShowScreenshotAlert] = useState(false);
  const [screenshotUser, setScreenshotUser] = useState<string | undefined>();
  // Video preview state
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  // Image safety scanning state
  const [pendingSafetyImage, setPendingSafetyImage] = useState<{ url: string; file: File } | null>(null);
  const [showImageSafetyGate, setShowImageSafetyGate] = useState(false);
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
  
  // Get streak with the other user (for DMs)
  const streak = useStreakWithUser(!isGroupChat ? otherMember?.id : undefined);

  // Clear message notifications + clear the unread badge when opening a conversation
  useEffect(() => {
    if (!profile?.id || !conversationId) return;

    // Update last_read_at for unread badge
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
          queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
        });
    }

    // Clear message notifications from senders in this conversation
    if (messageNotifsClearedForConversationRef.current !== conversationId && otherMembers.length > 0) {
      messageNotifsClearedForConversationRef.current = conversationId;

      // Get all member IDs from this conversation (excluding current user)
      const otherMemberIds = otherMembers.map(m => m.user_id);

      // Clear notifications from these specific users
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('type', 'message')
        .eq('read', false)
        .in('actor_id', otherMemberIds)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        });
    }
  }, [conversationId, profile?.id, queryClient, otherMembers]);

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

  // Scroll to bottom when conversation opens or messages change - instant method
  useEffect(() => {
    if (!conversationId) return;
    
    // Scroll immediately without delay for instant feel
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      }
    };
    
    // Use requestAnimationFrame for smoother, immediate scroll
    requestAnimationFrame(scrollToBottom);
    
  }, [conversationId, messages?.length]);

  // Enhanced Screenshot detection - desktop keyboard shortcuts + mobile resize detection
  useEffect(() => {
    if (!conversationId) return;
    
    // Desktop: Detect PrintScreen and Mac screenshot shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      console.log('[Screenshot] Key pressed:', e.key, 'meta:', e.metaKey, 'shift:', e.shiftKey);
      
      // Windows/Linux PrintScreen
      if (e.key === 'PrintScreen') {
        console.log('[Screenshot] PrintScreen detected!');
        notifyScreenshot();
        return;
      }
      // Mac: Cmd+Shift+3 (full screen) or Cmd+Shift+4 (selection) or Cmd+Shift+5 (menu)
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        console.log('[Screenshot] Mac shortcut detected!');
        notifyScreenshot();
        return;
      }
      // Windows: Win+Shift+S (Snipping Tool)
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
        console.log('[Screenshot] Win+Shift+S detected!');
        notifyScreenshot();
        return;
      }
    };

    // Mobile: iOS/Android screenshot detection via resize event
    let lastHeight = window.innerHeight;
    let screenshotDebounce: NodeJS.Timeout | null = null;
    
    const handleResize = () => {
      const heightDiff = Math.abs(window.innerHeight - lastHeight);
      if (heightDiff > 20 && heightDiff < 100) {
        if (screenshotDebounce) clearTimeout(screenshotDebounce);
        screenshotDebounce = setTimeout(() => {
          if (Math.abs(window.innerHeight - lastHeight) < 10) {
            console.log('[Screenshot] Mobile screenshot detected via resize!');
            notifyScreenshot();
          }
        }, 300);
      }
      lastHeight = window.innerHeight;
    };

    // Clipboard change detection - detects when image is copied to clipboard
    const handleCopy = (e: ClipboardEvent) => {
      // Check if clipboard contains image data (screenshot)
      if (e.clipboardData?.types.includes('image/png')) {
        console.log('[Screenshot] Clipboard image detected!');
        notifyScreenshot();
      }
    };

    // Focus/blur detection for mobile - some devices blur briefly during screenshot
    let blurTime = 0;
    const handleBlur = () => {
      blurTime = Date.now();
    };
    const handleFocus = () => {
      const blurDuration = Date.now() - blurTime;
      // Very brief blur (100-500ms) may indicate screenshot on mobile
      if (blurDuration > 100 && blurDuration < 500) {
        console.log('[Screenshot] Brief blur detected, possible screenshot');
        // Uncomment to enable: notifyScreenshot();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    window.addEventListener('keyup', handleKeyDown, true);   // Also check keyup for PrintScreen
    window.addEventListener('resize', handleResize);
    document.addEventListener('copy', handleCopy);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('copy', handleCopy);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      if (screenshotDebounce) clearTimeout(screenshotDebounce);
    };
  }, [conversationId, notifyScreenshot]);

  // Handle typing indicator - instant updates for both users
  const handleInputChange = useCallback((value: string) => {
    // Update text immediately - no blocking
    setMessageText(value);
    
    // Instant typing indicator update for live feedback
    if (value.length > 0) {
      setTyping(true);
      setLiveTyping(true);
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      typingTimeoutRef.current = setTimeout(() => {
        setTyping(false);
        setLiveTyping(false);
      }, 2000); // Faster timeout for snappier feel
    } else if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      setTyping(false);
      setLiveTyping(false);
    }
  }, [setTyping, setLiveTyping]);

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !conversationId) return;

    const text = messageText.trim();
    setMessageText('');
    setTyping(false);

    // Use instant send for immediate optimistic UI
    sendText(text, viewMode, replyingTo?.id);
    setReplyingTo(null);
  }, [messageText, conversationId, viewMode, replyingTo, setTyping, sendText]);

  // sendWithReply is now handled by useInstantSend's sendText

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

  // Send media message helper - uses instant send for optimistic UI
  const sendMediaMessage = useCallback(async (mediaUrl: string, mediaType: string) => {
    if (!conversationId || !profile?.id) return;

    try {
      await sendMedia(mediaUrl, mediaType, viewMode, replyingTo?.id);
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to send media:', error);
      throw error;
    }
  }, [conversationId, profile?.id, viewMode, replyingTo?.id, sendMedia]);

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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    // Create preview and show safety gate
    const previewUrl = URL.createObjectURL(file);
    setPendingSafetyImage({ url: previewUrl, file });
    setShowImageSafetyGate(true);
  }, [conversationId, profile?.id]);

  // Process image after safety check passes
  const processApprovedImage = useCallback(async (file: File, previewUrl: string) => {
    if (!conversationId || !profile?.id) return;
    
    uploadingRef.current = true;
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

  // Handle direct file selection (from Toybox) - now goes through safety gate
  const handleDirectImageSelect = useCallback(async (file: File) => {
    if (!file || !conversationId || !profile?.id) return;
    if (uploadingRef.current) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    // Create preview and show safety gate
    const previewUrl = URL.createObjectURL(file);
    setPendingSafetyImage({ url: previewUrl, file });
    setShowImageSafetyGate(true);
  }, [conversationId, profile?.id]);

  // Handle vybe camera send - uploads base64 image and sends as vybe
  const handleVybeSend = useCallback(async (imageDataUrl: string) => {
    if (!conversationId || !profile?.id) return;

    setIsUploadingMedia(true);

    try {
      // Properly convert base64 data URL to blob with correct mime type
      const base64Data = imageDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });
      
      const fileName = `${profile.user_id}/${Date.now()}_vybe.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          cacheControl: '31536000',
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(fileName);

      // Send as 'vybe' type for streak tracking
      await sendMedia(publicUrl, 'vybe', viewMode, replyingTo?.id);
      setReplyingTo(null);
      toast.success('VYBE sent! ✨');
    } catch (error) {
      console.error('Failed to send vybe:', error);
      toast.error('Failed to send VYBE');
    } finally {
      setIsUploadingMedia(false);
    }
  }, [conversationId, profile?.id, profile?.user_id, viewMode, replyingTo?.id, sendMedia]);

  // Handle video selection - opens the preview modal
  const handleVideoSelect = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      toast.error('Video must be less than 100MB');
      return;
    }
    setPendingVideoFile(file);
    setShowVideoPreview(true);
  }, []);

  // Handle video send from preview modal
  const handleVideoSend = useCallback(async (
    processedVideo: { blob: Blob; thumbnail: string; duration: number },
    caption: string
  ) => {
    if (!conversationId || !profile?.id) return;
    
    try {
      // Create a File from the processed blob
      const videoFile = new File([processedVideo.blob], 'video.mp4', { type: 'video/mp4' });
      
      await sendVideo(
        videoFile,
        processedVideo.thumbnail,
        processedVideo.duration,
        viewMode,
        replyingTo?.id,
        caption || undefined
      );
      
      setReplyingTo(null);
      setPendingVideoFile(null);
      setShowVideoPreview(false);
    } catch (error) {
      console.error('Failed to send video:', error);
      toast.error('Failed to send video');
    }
  }, [conversationId, profile?.id, viewMode, replyingTo?.id, sendVideo]);

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

  // Navigate to profile when avatar clicked, or open group info for group chats
  const handleAvatarClick = useCallback(() => {
    if (isGroupChat) {
      setShowGroupInfo(true);
    } else if (otherMember?.username) {
      navigate(`/u/${otherMember.username}`);
    }
  }, [isGroupChat, otherMember?.username, navigate]);

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
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* DM Image Safety Gate */}
      <AnimatePresence>
        {showImageSafetyGate && pendingSafetyImage && (
          <DMImageSafetyGate
            file={pendingSafetyImage.file}
            previewUrl={pendingSafetyImage.url}
            onApproved={() => {
              setShowImageSafetyGate(false);
              processApprovedImage(pendingSafetyImage.file, pendingSafetyImage.url);
              setPendingSafetyImage(null);
            }}
            onCancel={() => {
              setShowImageSafetyGate(false);
              if (pendingSafetyImage.url) {
                URL.revokeObjectURL(pendingSafetyImage.url);
              }
              setPendingSafetyImage(null);
            }}
            onBlocked={() => {
              // Keep gate open for blocked content
            }}
          />
        )}
      </AnimatePresence>

      {/* Screenshot alert popup */}
      <AnimatePresence>
        {screenshotEvents.length > 0 && (
          <ScreenshotAlert
            username={screenshotEvents[screenshotEvents.length - 1]?.username}
          />
        )}
      </AnimatePresence>

      {/* Header - fixed height, compact on mobile */}
      <header className="flex-shrink-0 h-14 sm:h-16 px-2 sm:px-4 border-b border-border flex items-center gap-2 sm:gap-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-20">
        <Button variant="ghost" size="icon" onClick={() => navigate('/messages')} className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        {/* Clickable Avatar - navigates to profile or opens group info */}
        <button 
          onClick={handleAvatarClick}
          className="relative flex-shrink-0 group"
          aria-label={isGroupChat ? "View group info" : "View profile"}
        >
          <div className="relative h-9 w-9 sm:h-10 sm:w-10">
            {/* Ring - exactly matches avatar container */}
            <div className="absolute inset-0 rounded-full ring-2 ring-primary/20 group-hover:ring-primary/50 transition-all" />
            <Avatar className="h-full w-full group-active:scale-95 transition-transform">
              {isGroupChat ? (
                conversation?.avatar_url ? (
                  <AvatarImage src={conversation.avatar_url} />
                ) : (
                  <AvatarFallback className="text-sm bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                    <Users className="h-4 w-4" />
                  </AvatarFallback>
                )
              ) : (
                <>
                  <AvatarImage src={otherMember?.avatar_url || undefined} />
                  <AvatarFallback className="text-sm">{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
                </>
              )}
            </Avatar>
          </div>
          {!isGroupChat && (
            <OnlineIndicator isOnline={otherMemberOnline} size="sm" className="bottom-0 right-0" />
          )}
          {isGroupChat && (
            <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-background">
              {otherMembers.length + 1}
            </div>
          )}
        </button>
        
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm sm:text-base truncate leading-tight flex items-center gap-1.5">
            {displayName}
            {!isGroupChat && otherMember?.id && isOwner(otherMember.username || '') && <OwnerBadge />}
            {!isGroupChat && otherMember?.id && isOwnerWife(otherMember.id) && <PrincessBadge />}
            {/* Streak indicator in header */}
            {!isGroupChat && streak && streak.streak_count > 0 && (
              <StreakIndicator 
                count={streak.streak_count} 
                expiresAt={streak.expires_at}
                size="sm"
                showExpiry
              />
            )}
          </h2>
          {isGroupChat ? (
            <button 
              onClick={() => setShowGroupInfo(true)}
              className="text-[11px] sm:text-xs text-muted-foreground leading-tight hover:text-primary transition-colors"
            >
              {otherMembers.length + 1} members · Tap for info
            </button>
          ) : (
            <LivePresenceBar
              isOnline={otherMemberOnline}
              isTyping={typingUsers.length > 0}
              isInChat={presentUsers.length > 0}
              username={otherMember?.username}
            />
          )}
        </div>
        
        {!isGroupChat && otherMember?.id && (
          <CallButtons 
            conversationId={conversationId!} 
            receiverId={otherMember.id}
            receiverUsername={otherMember.username}
            receiverDisplayName={otherMember.display_name}
            receiverAvatarUrl={otherMember.avatar_url}
          />
        )}
        
        {isGroupChat && otherMember?.id && (
          <CallButtons 
            conversationId={conversationId!} 
            receiverId={otherMember.id}
            receiverUsername={otherMember.username}
            receiverDisplayName={otherMember.display_name}
            receiverAvatarUrl={otherMember.avatar_url}
            isGroupCall={true}
            groupName={conversation?.name || 'Group Chat'}
            groupAvatar={conversation?.avatar_url}
            participantIds={otherMembers.map(m => m.user_id)}
          />
        )}


        {/* DM Feature Sheets - triggered from Toybox */}
        <VanishThreadsSheet conversationId={conversationId!} open={showVanishThreads} onOpenChange={setShowVanishThreads} />
        <MemoryPinsSheet conversationId={conversationId!} messages={messages || []} open={showMemoryPins} onOpenChange={setShowMemoryPins} />
        <ScheduleMessageSheet conversationId={conversationId!} open={showScheduleMessage} onOpenChange={setShowScheduleMessage} />
        <DMSettingsSheetControlled conversationId={conversationId!} open={showDMSettings} onOpenChange={setShowDMSettings} />
        
        {/* Admin Panel Sheet - for moderating users in DMs */}
        {!isGroupChat && otherMember && (
          <AdminPanelSheet
            open={showAdminPanel}
            onOpenChange={setShowAdminPanel}
            userId={otherMember.id}
            username={otherMember.username || 'User'}
          />
        )}
        
        {/* Group Info Sheet */}
        {isGroupChat && (
          <GroupInfoSheet
            open={showGroupInfo}
            onOpenChange={setShowGroupInfo}
            conversationId={conversationId!}
            groupName={conversation?.name || 'Group Chat'}
            groupAvatar={conversation?.avatar_url}
            creatorId={conversation?.members?.find(m => m.role === 'owner')?.user_id}
          />
        )}

        {/* Pre-call Media Settings */}
        <CallSettingsSheet
          isOpen={showMediaSettings}
          onOpenChange={setShowMediaSettings}
          isVideoCall={true}
        />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="flex-shrink-0 h-9 w-9 sm:h-10 sm:w-10">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-50 bg-popover">
            <DropdownMenuItem onClick={handleAvatarClick}>{t('messages.viewProfile')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowMediaSettings(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Media Settings
            </DropdownMenuItem>
            <DropdownMenuItem>{t('messages.muteNotifications')}</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">{t('messages.blockUser')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Messages - scrollable area with edge-to-edge bubbles */}
      <div 
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden min-h-0",
          "px-3 sm:px-4 py-3 sm:py-4",
          "scroll-smooth",
          getWallpaperClass()
        )}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
          contain: 'strict',
        }}
      >
        {/* Messages container - extra bottom padding on mobile for bottom nav */}
        <div className="flex flex-col gap-0 pb-20 md:pb-4">
          {messageItems.map(({ message, isOwn, showAvatar, showTimestamp, sameSender, isMediaTransition, isEmojiOnly }, index) => {
            // Instagram/Snapchat spacing rules:
            // Same sender consecutive: 4-6px gap (tight grouping)
            // Different sender: 16-20px gap (clear separation)
            // After reply preview: 12-14px gap
            const prevItem = index > 0 ? messageItems[index - 1] : null;
            const senderChanged = prevItem && prevItem.isOwn !== isOwn;
            const hasReply = !!message.reply_to_id;
            
            // Calculate margin based on context - use pt for top margin
            let spacingClass = 'pt-1.5'; // Default: same sender (6px)
            if (senderChanged) {
              spacingClass = 'pt-4 sm:pt-5'; // Different sender (16-20px)
            } else if (hasReply) {
              spacingClass = 'pt-3 sm:pt-3.5'; // After reply (12-14px)
            }
            if (isMediaTransition) {
              spacingClass = 'pt-4 sm:pt-5'; // Media transition (16-20px)
            }
            
            // Check if this is a screenshot or screen recording notification system message
            const isScreenshotNotification = message.message_type === 'screenshot_notification';
            const isRecordingNotification = message.message_type === 'screen_recording_notification';
            const isCaptureNotification = isScreenshotNotification || isRecordingNotification;
            
            if (isCaptureNotification) {
              const isRecording = message.content?.includes('started') || message.content?.includes('possible');
              const isStopped = message.content?.includes('stopped');
              
              return (
                <div key={message.id} className={cn(spacingClass, index === 0 && 'pt-0')}>
                  {showTimestamp && (
                    <div className="text-center py-5 sm:py-6">
                      <span className="text-[10px] sm:text-[11px] text-muted-foreground/50 bg-muted/30 px-3 py-1 rounded-full font-medium">
                        {formatMessageDate(message.created_at)}
                      </span>
                    </div>
                  )}
                  {/* Capture notification - centered system message */}
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex justify-center py-2"
                  >
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium backdrop-blur-sm border",
                      isScreenshotNotification 
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                        : isRecording
                          ? "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
                          : isStopped
                            ? "bg-muted/50 border-border/30 text-muted-foreground"
                            : "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400"
                    )}>
                      {isScreenshotNotification ? (
                        <Camera className="h-3.5 w-3.5" />
                      ) : (
                        <span className={cn(
                          "relative flex h-2 w-2",
                          isRecording && "animate-pulse"
                        )}>
                          <span className={cn(
                            "absolute inline-flex h-full w-full rounded-full opacity-75",
                            isRecording ? "bg-red-500 animate-ping" : "bg-current"
                          )}></span>
                          <span className={cn(
                            "relative inline-flex rounded-full h-2 w-2",
                            isRecording ? "bg-red-500" : "bg-current"
                          )}></span>
                        </span>
                      )}
                      <span>
                        {message.sender?.username || 'Someone'} {message.content}
                      </span>
                    </div>
                  </motion.div>
                </div>
              );
            }
            
            return (
              <div 
                key={message.id}
                className={cn(spacingClass, index === 0 && 'pt-0')}
              >
                {showTimestamp && (
                  <div className="text-center py-5 sm:py-6">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground/50 bg-muted/30 px-3 py-1 rounded-full font-medium">
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
                    onNavigateToPost={(postId) => navigate(`/shorts?id=${postId}`)}
                  />
                </SwipeToReply>
              </div>
            );
          })}

          {/* Messages now use instant optimistic updates embedded in the messages array */}

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

          {/* Screenshot notification banner - Snapchat style */}
          <AnimatePresence>
            {screenshotEvents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-2 py-2 px-4 mx-4 mb-2 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-sm"
              >
                <Camera className="h-4 w-4" />
                <span className="font-medium">
                  {screenshotEvents[screenshotEvents.length - 1]?.username} took a screenshot
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live activity bubble - shows other user's PFP with activity */}
          <AnimatePresence>
            {!isGroupChat && otherUserActivity && isOtherUserPresent && (
              <InlineActivityBubble
                avatarUrl={otherUserActivity.avatar_url}
                username={otherUserActivity.username}
                activity={otherUserActivity.activity}
              />
            )}
          </AnimatePresence>

          {/* Group chat presence indicator */}
          {isGroupChat && presentUsers && presentUsers.length > 0 && (
            <ChatPresenceIndicator
              presentUsers={presentUsers}
              typingUserIds={typingUsers || []}
              maxDisplay={3}
            />
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>


      {/* VYBE Camera Modal */}
      <SnapCamera
        isOpen={showSnapCamera}
        onClose={() => setShowSnapCamera(false)}
        onSend={handleVybeSend}
      />

      {/* Video Send Preview Modal */}
      <VideoSendPreview
        open={showVideoPreview}
        onClose={() => {
          setShowVideoPreview(false);
          setPendingVideoFile(null);
        }}
        file={pendingVideoFile}
        recipientName={displayName}
        recipientAvatar={isGroupChat ? conversation?.avatar_url : otherMember?.avatar_url}
        onSend={handleVideoSend}
      />

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
            isPending={false}
            inputRef={inputRef}
            fileInputRef={fileInputRef}
            handleInputChange={handleInputChange}
            handleKeyPress={handleKeyPress}
            handleSend={handleSend}
            handleImageSelect={handleImageSelect}
            handleVideoSelect={handleVideoSelect}
            handleVoiceRecordingComplete={handleVoiceRecordingComplete}
            sendMediaMessage={sendMediaMessage}
            setViewMode={setViewMode}
            setIsRecordingVoice={setIsRecordingVoice}
            onLiveRecordingChange={setLiveRecordingVoice}
            clearReply={clearReply}
            t={t}
            onOpenVanishThreads={() => setShowVanishThreads(true)}
            onOpenMemoryPins={() => setShowMemoryPins(true)}
            onOpenScheduleMessage={() => setShowScheduleMessage(true)}
            onOpenDMSettings={() => setShowDMSettings(true)}
            onOpenAdminPanel={!isGroupChat ? () => setShowAdminPanel(true) : undefined}
            onOpenSnapCamera={() => setShowSnapCamera(true)}
            presentUsers={presentUsers}
            typingUserIds={typingUsers}
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
          isPending={false}
          inputRef={inputRef}
          fileInputRef={fileInputRef}
          handleInputChange={handleInputChange}
          handleKeyPress={handleKeyPress}
          handleSend={handleSend}
          handleImageSelect={handleImageSelect}
          handleVideoSelect={handleVideoSelect}
          handleVoiceRecordingComplete={handleVoiceRecordingComplete}
          sendMediaMessage={sendMediaMessage}
          setViewMode={setViewMode}
          setIsRecordingVoice={setIsRecordingVoice}
          onLiveRecordingChange={setLiveRecordingVoice}
          clearReply={clearReply}
          t={t}
          onOpenVanishThreads={() => setShowVanishThreads(true)}
          onOpenMemoryPins={() => setShowMemoryPins(true)}
          onOpenScheduleMessage={() => setShowScheduleMessage(true)}
          onOpenDMSettings={() => setShowDMSettings(true)}
          onOpenAdminPanel={!isGroupChat ? () => setShowAdminPanel(true) : undefined}
          onOpenSnapCamera={() => setShowSnapCamera(true)}
          presentUsers={presentUsers}
          typingUserIds={typingUsers}
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
  handleVideoSelect,
  handleVoiceRecordingComplete,
  sendMediaMessage,
  setViewMode,
  setIsRecordingVoice,
  onLiveRecordingChange,
  clearReply,
  t,
  onOpenVanishThreads,
  onOpenMemoryPins,
  onOpenScheduleMessage,
  onOpenDMSettings,
  onOpenAdminPanel,
  onOpenSnapCamera,
  presentUsers,
  typingUserIds,
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
  handleVideoSelect: (file: File) => void;
  handleVoiceRecordingComplete: (blob: Blob) => void;
  sendMediaMessage: (mediaUrl: string, mediaType: string) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setIsRecordingVoice: (recording: boolean) => void;
  onLiveRecordingChange?: (recording: boolean) => void;
  clearReply: () => void;
  t: (key: string) => string;
  onOpenVanishThreads?: () => void;
  onOpenMemoryPins?: () => void;
  onOpenScheduleMessage?: () => void;
  onOpenDMSettings?: () => void;
  onOpenAdminPanel?: () => void;
  onOpenSnapCamera?: () => void;
  presentUsers?: { user_id: string; username: string; avatar_url: string | null; display_name: string | null; is_typing: boolean }[];
  typingUserIds?: string[];
}) {
  return (
    <div className="flex-shrink-0 border-t border-border bg-background sticky bottom-0 z-30">
      
      <div className="px-2 py-2 sm:px-4 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            onCancel={() => {
              setIsRecordingVoice(false);
              onLiveRecordingChange?.(false);
            }}
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
              onVideoSelect={(file) => {
                handleVideoSelect(file);
              }}
              onGifSelect={async (gifUrl) => {
                await sendMediaMessage(gifUrl, 'gif');
              }}
              onVoiceStart={() => {
                setIsRecordingVoice(true);
                onLiveRecordingChange?.(true);
              }}
              onEmojiSelect={(emoji) => {
                handleInputChange(messageText + emoji);
                inputRef.current?.focus();
              }}
              isUploading={isUploadingMedia}
              onOpenVanishThreads={onOpenVanishThreads}
              onOpenMemoryPins={onOpenMemoryPins}
              onOpenScheduleMessage={onOpenScheduleMessage}
              onOpenDMSettings={onOpenDMSettings}
              onOpenAdminPanel={onOpenAdminPanel}
              onOpenVybeCamera={onOpenSnapCamera}
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
              <div className="flex items-center gap-1">
                {/* VYBE Camera button */}
                {onOpenSnapCamera && (
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={onOpenSnapCamera}
                    className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9 text-primary hover:bg-primary/10"
                  >
                    <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
                  </Button>
                )}
                <Button 
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsRecordingVoice(true);
                    onLiveRecordingChange?.(true);
                  }}
                  className="flex-shrink-0 h-8 w-8 sm:h-9 sm:w-9"
                >
                  <Mic className="h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </div>
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
  onNavigateToPost,
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
  onNavigateToPost?: (postId: string) => void;
}) {
  const [isViewed, setIsViewed] = useState(false);
  const [vybeViewed, setVybeViewed] = useState(false);
  const [showVybeViewer, setShowVybeViewer] = useState(false);
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
  const isVideoMessage = message.media_url && message.media_type === 'video';
  const isVybeMessage = message.media_url && message.media_type === 'vybe';
  const isSharedPost = message.message_type === 'shared_post';

  return (
    <div className={cn(
      'flex w-full group/message relative',
      isOwn ? 'justify-end' : 'justify-start'
    )}>
      {/* Container for avatar + bubble - left aligned for received */}
      <div className={cn(
        'flex gap-2 sm:gap-2.5 items-end',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        // Max width but auto-shrink to content
        'max-w-[85%] sm:max-w-[75%]'
      )}>
        {/* Avatar - only for received messages */}
        {!isOwn && showAvatar && (
          <Avatar className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 ring-1 ring-background shadow-sm">
            <AvatarImage src={sender?.avatar_url || undefined} />
            <AvatarFallback className="text-xs">{sender?.username?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        {/* Spacer for consecutive messages from same sender */}
        {!isOwn && !showAvatar && <div className="w-8 sm:w-9 flex-shrink-0" />}

        {/* Message content wrapper - auto width based on content */}
        <div className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}>
        {/* Reply preview - clear spacing with rounded container */}
        {repliedMessage && (
          <div
            className={cn(
              "text-[10px] sm:text-[11px] px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-2xl mb-1.5 max-w-full",
              isOwn 
                ? "bg-primary/15 text-primary-foreground/70 rounded-br-lg" 
                : "bg-muted/50 text-muted-foreground rounded-bl-lg"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <CornerUpLeft className="h-3 w-3" />
              <span className="font-medium text-[11px]">{repliedMessage.sender?.username || 'Message'}</span>
            </div>
            <p className="truncate opacity-75 text-[11px]">
              {repliedMessage.content || (repliedMessage.media_type === 'image' ? '📷 Photo' : '🎤 Voice')}
            </p>
          </div>
        )}

        {/* Shared Post - render directly without bubble wrapper */}
        {isSharedPost && (
          <SharedPostBubble
            postId={message.content || ''}
            mediaUrl={message.media_url}
            mediaType={message.media_type}
            isOwn={isOwn}
            onNavigate={onNavigateToPost}
          />
        )}

        {/* Message bubble - Instagram-quality padding and radius (not for shared posts) */}
        {!isSharedPost && (
        <div
          className={cn(
            'relative rounded-[20px] break-words select-none group/bubble',
            // Padding: 14-16px horizontal, 10-12px vertical
            isEmojiOnly 
              ? 'px-3 py-2' // Reduced padding for emoji
              : isMediaMessage
                ? 'p-1.5 sm:p-2' // Media bubbles: minimal padding
                : 'px-[14px] py-[10px] sm:px-4 sm:py-3', // Text: 14-16px H, 10-12px V
            isOwn 
              ? `${themeColor.bubble} ${themeColor.text} rounded-br-lg` 
              : 'bg-muted/70 text-foreground rounded-bl-lg',
            message.view_mode === 'view_once' && 'bg-gradient-to-r from-orange-500 to-pink-500 text-white',
            message.view_mode === '24h' && isOwn && 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white',
            repliedMessage && 'rounded-t-[14px]'
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onDoubleClick={onToggleReactions}
        >
          {/* Quick action button - appears on hover/touch */}
          <div className={cn(
            "absolute top-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10",
            isOwn ? "-left-8" : "-right-8"
          )}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 rounded-full bg-muted/80 hover:bg-muted text-muted-foreground">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOwn ? "end" : "start"} className="min-w-[140px]">
                <DropdownMenuItem onClick={onReply} className="gap-2 text-sm">
                  <Reply className="h-4 w-4" /> Reply
                </DropdownMenuItem>
                {message.content && (
                  <DropdownMenuItem onClick={copyToClipboard} className="gap-2 text-sm">
                    <Check className="h-4 w-4" /> Copy
                  </DropdownMenuItem>
                )}
                {isOwn && message.content && !message.media_url && (
                  <DropdownMenuItem onClick={() => onEdit?.()} className="gap-2 text-sm">
                    <Edit3 className="h-4 w-4" /> Edit
                  </DropdownMenuItem>
                )}
                {isOwn && (
                  <DropdownMenuItem onClick={handleUnsend} className="gap-2 text-sm text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" /> Unsend
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { onDeleteForMe(); }} className="gap-2 text-sm text-muted-foreground">
                  <EyeOff className="h-4 w-4" /> Delete for me
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {/* Shared Post is rendered outside the bubble wrapper now */}

          {/* Image/GIF message (not for shared posts - they use SharedPostBubble) */}
          {isMediaMessage && !isSharedPost && (
            <div className={message.content ? "mb-2" : ""}>
              <img
                src={message.media_url}
                alt={message.media_type === 'gif' ? "GIF" : "Shared image"}
                className="rounded-xl max-w-full max-h-52 sm:max-h-64 object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Video message - regular DM video (not shared posts) */}
          {isVideoMessage && !isSharedPost && (
            <div className={cn(message.content ? "mb-2" : "", "relative cursor-pointer group")}>
              <div className="relative aspect-[9/16] w-32 sm:w-40 overflow-hidden rounded-xl bg-black">
                <video
                  src={message.media_url!}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                  loop
                  autoPlay
                  preload="metadata"
                  poster={message.media_url + '#t=0.1'}
                />
                {/* Play overlay hint */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="h-5 w-5 text-black ml-0.5" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VYBE message - Snapchat style tap to view (view once) */}
          {isVybeMessage && (
            <div className={message.content ? "mb-2" : ""}>
              {isOwn ? (
                // Sender sees "Sent" state - cannot view their own VYBE
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "relative w-36 h-14 sm:w-40 sm:h-16 rounded-2xl overflow-hidden",
                    vybeViewed 
                      ? "bg-gradient-to-r from-muted/50 to-muted/30" 
                      : "bg-gradient-to-r from-primary/20 to-accent/20",
                    "border border-border/30",
                    "flex items-center justify-center gap-2"
                  )}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className={cn(
                      "p-1.5 rounded-full",
                      vybeViewed ? "bg-muted/50" : "bg-primary/20"
                    )}>
                      {vybeViewed ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <Camera className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">
                        {vybeViewed ? 'Opened' : 'Sent'}
                      </span>
                      <span className="text-[9px] opacity-60">VYBE</span>
                    </div>
                  </div>
                </motion.div>
              ) : vybeViewed ? (
                // Receiver after viewing - show "Opened" state like Snapchat
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "relative w-36 h-14 sm:w-40 sm:h-16 rounded-2xl overflow-hidden",
                    "bg-gradient-to-r from-muted/50 to-muted/30",
                    "border border-border/30",
                    "flex items-center justify-center gap-2"
                  )}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="p-1.5 rounded-full bg-muted/50">
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Opened</span>
                      <span className="text-[9px] opacity-60">VYBE</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                // Receiver before viewing - tap to open fullscreen
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setShowVybeViewer(true);
                  }}
                  className={cn(
                    "relative w-36 h-48 sm:w-40 sm:h-52 rounded-2xl overflow-hidden",
                    "bg-gradient-to-br from-primary via-accent to-primary",
                    "flex flex-col items-center justify-center gap-3",
                    "shadow-xl shadow-primary/20 border border-white/20",
                    "cursor-pointer"
                  )}
                >
                  {/* Animated gradient background */}
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-primary bg-[length:200%_200%]"
                    animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                  />
                  
                  {/* Blurred preview background */}
                  <div 
                    className="absolute inset-0 bg-cover bg-center blur-2xl opacity-30 scale-110"
                    style={{ backgroundImage: `url(${message.media_url})` }}
                  />
                  
                  {/* Tap to view overlay */}
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white">
                    <motion.div 
                      className="p-4 rounded-full bg-white/20 backdrop-blur-md border border-white/30"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Camera className="h-7 w-7" />
                    </motion.div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold tracking-wide">TAP TO VIEW</span>
                      <div className="flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full bg-white/10">
                        <Sparkles className="h-3 w-3" />
                        <span className="text-[10px] font-semibold">VYBE</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Enhanced shimmer effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
                    animate={{ x: ['-150%', '150%'] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.5 }}
                  />
                  
                  {/* Corner glow effects */}
                  <div className="absolute top-0 left-0 w-20 h-20 bg-white/20 rounded-full blur-2xl -translate-x-1/2 -translate-y-1/2" />
                  <div className="absolute bottom-0 right-0 w-20 h-20 bg-accent/30 rounded-full blur-2xl translate-x-1/2 translate-y-1/2" />
                </motion.button>
              )}
              
              {/* Fullscreen VYBE Viewer - only for receiver */}
              {!isOwn && (
                <VybeViewer
                  mediaUrl={message.media_url || ''}
                  senderName={sender?.username}
                  senderAvatar={sender?.avatar_url}
                  isOpen={showVybeViewer}
                  onClose={() => {
                    setShowVybeViewer(false);
                    setVybeViewed(true);
                    onView();
                  }}
                  onReply={onReply}
                />
              )}
            </div>
          )}

          {/* Voice notes: auto-height with min-height 48px, max width 80% */}
          {isAudioMessage && (
            <div className="min-w-[180px] max-w-[80%] min-h-[48px]">
              <AudioMessage src={message.media_url} isOwn={isOwn} />
            </div>
          )}

          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <p className="text-[13px] sm:text-sm italic opacity-75 leading-[1.4]">Message viewed</p>
          ) : message.content ? (
            <p className={cn(
              "whitespace-pre-wrap leading-[1.4]",
              isEmojiOnly 
                ? "text-2xl sm:text-3xl" // Larger font for emoji-only
                : "text-[14px] sm:text-[15px]" // Readable size
            )}>{message.content}</p>
          ) : null}

          {message.view_mode !== 'permanent' && (
            <div className="flex items-center gap-1 mt-1 opacity-70">
              {message.view_mode === 'view_once' ? (
                <EyeOff className="h-2.5 w-2.5" />
              ) : (
                <Clock className="h-2.5 w-2.5" />
              )}
              <span className="text-[9px]">
                {message.view_mode === 'view_once' ? 'View once' : '24h'}
              </span>
            </div>
          )}
        </div>
        )}

        {/* Reactions bar - floats below message */}
        {uniqueReactions.length > 0 && (
          <div className="flex items-center gap-0.5 mt-1 bg-background/95 border border-border/40 rounded-full px-1.5 py-0.5 shadow-sm self-start">
            {uniqueReactions.slice(0, 3).map(([emoji, count]) => (
              <span key={emoji} className="text-xs flex items-center">
                {emoji}
                {count > 1 && <span className="text-[9px] ml-0.5 text-muted-foreground">{count}</span>}
              </span>
            ))}
            {uniqueReactions.length > 3 && (
              <span className="text-[9px] text-muted-foreground ml-0.5">+{uniqueReactions.length - 3}</span>
            )}
          </div>
        )}

        {/* Timestamp and read receipts - 6-8px below bubble */}
        <div className={cn(
          "flex items-center gap-1.5 mt-2",
          isOwn ? "justify-end" : "justify-start"
        )}>
          <span className="text-[10px] text-muted-foreground/50 font-light">
            {format(new Date(message.created_at), 'HH:mm')}
          </span>
          {isOwn && (
            <>
              {hasBeenViewed ? (
                <div className="flex items-center gap-0.5">
                  <Eye className="h-3 w-3 text-primary/60" />
                  {message.views && message.views.length > 0 && (
                    <span className="text-[9px] font-medium text-primary/60">
                      {message.views.length}
                    </span>
                  )}
                </div>
              ) : (
                <Check className="h-2.5 w-2.5 text-muted-foreground/40" />
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

        {/* Quick reactions popup - positioned above the bubble */}
        <AnimatePresence>
          {showReactions && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.8, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 10 }}
              transition={{ duration: 0.15 }}
              className={cn(
                "absolute bottom-full mb-2 bg-background border border-border rounded-full px-2 py-1.5 shadow-xl flex gap-0.5 z-50",
                isOwn ? "right-0" : "left-0"
              )}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReaction(emoji);
                  }}
                  className={cn(
                    "p-1.5 hover:scale-125 active:scale-95 transition-transform text-lg sm:text-xl rounded-full",
                    userReaction === emoji && "bg-primary/20"
                  )}
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

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
            {isOwn && message.content && !message.media_url && (
              <button
                onClick={() => { onEdit?.(); setShowContextMenu(false); menuOpenedRef.current = false; }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2"
              >
                <Edit3 className="h-4 w-4" /> Edit
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
        {/* Edited indicator */}
        {message.is_edited && (
          <span className="text-[9px] text-muted-foreground/50 italic ml-1">(edited)</span>
        )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
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

// Optimistic messages are now embedded directly in the messages cache
// The OptimisticMessageBubble component is no longer needed
