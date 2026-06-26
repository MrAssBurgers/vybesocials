import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo, useMemo, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { 
  useMessages, 
  useScreenshotNotification,
  useMarkMessageViewed,
  useMarkVybeReplayExhausted,
  useAddReaction,
  useToggleSavedMessage,
  ViewMode,
  Message,
} from '@/hooks/useMessages';
import { useConversationDetail } from '@/hooks/useDMConversations';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useInstantSend } from '@/hooks/useInstantSend';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { setCurrentConversationId } from '@/hooks/useGlobalRealtimeMessages';
import { useUnsendForEveryone, useDeleteForMe, useEditMessage } from '@/hooks/useMessageActions';
import { useInstantReadClear } from '@/hooks/useMessageNotifications';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { useAISmartReplies } from '@/hooks/useAIMessageAssist';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { blackoutChatScreenNow } from '@/lib/chatScreenShield';
import { useAuth } from '@/lib/auth';
import {
  displayNameForConversation,
  isViewerMember,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { scanVideo as nsfwScanVideo, scanImage as nsfwScanImage } from '@/lib/nsfwScanner';
import { repairConversationForSend } from '@/lib/dmMembershipRepair';
import { compressVybeDataUrl } from '@/lib/vybeImageCompress';
import { getVybeRecipientState } from '@/lib/vybeViewState';
import {
  bumpConversationUpdatedAt,
  expiresAtForViewMode,
  insertDmMessage,
} from '@/lib/dmSendCore';
import { replaceOptimisticMessage } from '@/lib/messagesQueryKey';
import { sendDmBroadcastMessage } from '@/lib/dmBroadcast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
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
import { useChatScreenShield } from '@/hooks/useChatScreenShield';
import { CHAT_SHIELD_ROOT_ID } from '@/lib/chatScreenShield';
import { usePeerLastReadAt } from '@/hooks/usePeerLastReadAt';
import { ChatPresenceIndicator } from './ChatPresenceIndicator';
import { LivePresenceBar, ScreenshotAlert, SnapchatStatus } from './SnapchatFeedback';
import { EphemeralChatNotice } from './EphemeralChatNotice';
import { resolveOwnMessageStatus } from '@/lib/messageReadStatus';
import { ChatPresenceDock, ChatHeaderPresenceAvatar, GroupPresenceBar, pickGroupDockPeer } from './LiveActivityIndicator';
import { SignedAvatar } from '@/components/ui/SignedAvatar';
import { CallEventBubble } from './CallEventBubble';
import { AIAssistButton } from './AIAssistButton';
import { SmartRepliesBar } from './SmartRepliesBar';
import { ChatSummarySheet } from './ChatSummarySheet';
import { AdminPanelSheet } from './AdminPanelSheet';
import { useInteractionStreakBump } from '@/hooks/useInteractionStreakBump';

import { SwipeToReply } from './SwipeToReply';
import { MessageActionMenu } from './MessageActionMenu';
import { DMHoldMenu } from './DMHoldMenu';
import { ReplyPreview } from './ReplyPreview';
import { StickerPanel } from './StickerPanel';
import { useAddSticker } from '@/hooks/useStickers';
import { 
  ArrowLeft, 
  Send, 
  Lock,
  MoreVertical,
  Eye,
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
  Play,
  Copy,
  Pencil,
  Sticker,
  Download,
  Bookmark
} from 'lucide-react';
import { Toybox } from './Toybox';
import { EmojiPicker } from './EmojiPicker';
import { openCameraFromGesture, useCameraOverlay } from '@/contexts/CameraOverlayContext';
import { KeyboardAwareTexter } from '@/components/chat/KeyboardAwareTexter';
import { shouldTrackSoftKeyboard } from '@/lib/keyboardInsets';
import { Texter } from '@/components/chat/Texter';
import { stopCameraStream } from '@/hooks/useCameraPreload';
import { useCallStore } from '@/lib/callStore';
import { VybeViewer } from './VybeViewer';
import { CameraFirstOverlay } from './CameraFirstOverlay';
// Flying bubble removed - messages now pop in like iMessage
import { VideoSendPreview } from './VideoSendPreview';
import { VideoBubble } from './VideoBubble';
import { VideoMessageViewer } from './VideoMessageViewer';
import { SharedPostBubble } from './SharedPostBubble';
import { SharedThemeMessageBubble } from '@/components/messages/bubbles/SharedThemeMessageBubble';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { saveElementScrollPosition, restoreElementScrollPosition } from '@/lib/scrollMemory';
import { normalizeMessagesCache, safeMessageViews, safeMessageReactions } from '@/lib/messagesQueryKey';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { useUserOnlineStatus } from '@/hooks/usePresence';
import { DMSafetyGate } from './DMSafetyGate';
import { GroupInfoSheet } from './GroupInfoSheet';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { StreakIndicator } from './StreakIndicator';
import { useStreakWithUser } from '@/hooks/useStreaks';
import { DMImageSafetyGate } from './DMImageSafetyGate';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useUserBusiness } from '@/hooks/useBusinessOffers';
import { CreateOfferDialog } from '@/components/business/CreateOfferDialog';
import { ChatMediaBubble, SignedAudioUrl } from './ChatMediaBubble';
import { ImageViewer } from './ImageViewer';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { useConversationSafety } from '@/hooks/useConversationSafety';
import { SafetyFilterRequest } from './SafetyFilterRequest';
import { SafetyFilterRequestButton } from './SafetyFilterRequestButton';
import { getTopEmojis, recordEmoji } from '@/lib/frequentEmojis';
import { NowPlayingInline } from '@/components/music/NowPlayingInline';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';
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
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const authUserId = profile?.user_id ?? user?.id;
  const queryClient = useQueryClient();
  const bumpStreak = useInteractionStreakBump();
  
  const { data: conversation, isPending: conversationPending, isFetched: conversationFetched, isError: conversationError } = useConversationDetail(conversationId);
  const safeConversation = conversation ? { ...conversation, members: ensureArray(conversation.members) } : conversation;
  const isGroupChat = safeConversation?.is_group || false;
  const { data: messagesRaw, isPending: messagesPending, isFetched: messagesFetched, isError: messagesError, refetch: refetchMessages } = useMessages(conversationId);
  const messages = normalizeMessagesCache(messagesRaw);
  const { sendText, sendMedia, sendVideo, retry: retryMessage, removeMessage, videoUploadProgress } = useInstantSend(conversationId);

  // Register current conversation for global realtime updates
  useEffect(() => {
    setCurrentConversationId(conversationId || null);
    return () => setCurrentConversationId(null);
  }, [conversationId]);
  
  // Batch preload media URLs when idle — don't compete with first paint.
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const mediaUrls = messages
      .map(m => m.media_url)
      .filter((url): url is string => !!url && !url.startsWith('blob:') && !url.startsWith('data:'));
    if (mediaUrls.length === 0) return;

    const run = () => {
      import('@/lib/signedUrlCache').then(({ batchSignUrls }) => batchSignUrls(mediaUrls));
    };
    let idleId: number;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 2000 });
    } else {
      idleId = window.setTimeout(run, 600) as unknown as number;
    }
    return () => {
      if (typeof requestIdleCallback !== 'undefined') cancelIdleCallback(idleId);
      else clearTimeout(idleId);
    };
  }, [messages]);
  
  // Enable realtime sync for this specific conversation (reactions, views, etc.)
  useRealtimeMessages(conversationId);
  const markViewed = useMarkMessageViewed(conversationId);
  const markVybeReplayExhausted = useMarkVybeReplayExhausted(conversationId);
  const toggleSaved = useToggleSavedMessage(conversationId);
  const addReaction = useAddReaction();
  const unsendForEveryone = useUnsendForEveryone();
  const deleteForMe = useDeleteForMe();
  const editMessage = useEditMessage();
  const { notifyCapture, screenshotEvents: rawScreenshotEvents, isRecording } = useScreenshotNotification(conversationId);
  const screenshotEvents = Array.isArray(rawScreenshotEvents) ? rawScreenshotEvents : [];
  
  // v1.1: Instant read clear - marks as read immediately and clears badges
  useInstantReadClear(conversationId);
  
  // Block screenshots — native OS shield + instant web blackout
  useChatScreenShield(!!conversationId);

  // Snapchat-style screen capture detection
  const { setActivelyViewingChat } = useScreenCapture({
    enabled: !!conversationId,
    onCapture: (event) => {
      if (import.meta.env.DEV) console.log('[ChatView] Capture detected:', event);
      if (event.confidence === 'low') return;
      // Medium-confidence PWA heuristics (resize/visibility) fire on keyboard open
      // and DM layout shifts — never blackout the whole app for those.
      if (event.confidence !== 'high') return;
      if (event.platform !== 'desktop') {
        blackoutChatScreenNow();
      }
      notifyCapture(event.type);
    }
  });
  
  // Update chat active state for accurate screenshot detection when leaving/entering tab
  useEffect(() => {
    if (conversationId) {
      setActivelyViewingChat(true);
    }
    return () => setActivelyViewingChat(false);
  }, [conversationId, setActivelyViewingChat]);
  
  // v1.1: AI Smart Replies
  const { suggestions: smartReplies, generateReplies, clearSuggestions } = useAISmartReplies();
  
  const { settings } = useDMSettings(conversationId);
  const conversationSafety = useConversationSafety(conversationId);

  // Compute the latest time the other user read any of our messages
  const lastReadAt = useMemo(() => {
    if (!messages || !profileId) return null;
    let latest: string | null = null;
    for (const msg of messages) {
      if (msg.sender_id === profileId && Array.isArray(msg.views)) {
        for (const view of msg.views) {
          if (view.user_id !== profileId && view.viewed_at) {
            if (!latest || view.viewed_at > latest) {
              latest = view.viewed_at;
            }
          }
        }
      }
    }
    return latest;
  }, [messages, profileId]);

  // Live input value lives in a ref so keystrokes don't re-render the
  // 2700-line ChatView tree. Parent state only flips when the empty/
  // non-empty boundary changes (which is what gates the send button).
  const messageTextRef = useRef<string>('');
  const [hasText, setHasText] = useState(false);

  // Initial draft load + restore on conversation switch
  useEffect(() => {
    if (!conversationId) {
      messageTextRef.current = '';
      setHasText(false);
      return;
    }
    let saved = '';
    try { saved = localStorage.getItem(`draft:${conversationId}`) || ''; } catch { /* ignore */ }
    messageTextRef.current = saved;
    setHasText(saved.length > 0);
  }, [conversationId]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('vybe-dm-view-mode');
      if (saved === 'permanent' || saved === '24h' || saved === 'view_once') {
        return saved;
      }
    } catch { /* ignore */ }
    return '24h';
  });

  useEffect(() => {
    try {
      localStorage.setItem('vybe-dm-view-mode', viewMode);
    } catch { /* ignore */ }
  }, [viewMode]);
  const [showViewModeMenu, setShowViewModeMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isVoiceLocked, setIsVoiceLocked] = useState(false);
  const voiceLockStartYRef = useRef<number | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; file: File } | null>(null);
  const uploadingRef = useRef(false); // Prevent double uploads
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeReactionMessageId, setActiveReactionMessageId] = useState<string | null>(null);
  const [showContextMenuMessageId, setShowContextMenuMessageId] = useState<string | null>(null);
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
  const [cameraFirstMode, setCameraFirstMode] = useState(false);

  const callStore = useCallStore();
  const { openCamera, isOpen: isCameraOpen } = useCameraOverlay();
  const [showScreenshotAlert, setShowScreenshotAlert] = useState(false);
  const [screenshotUser, setScreenshotUser] = useState<string | undefined>();
  // Video preview state
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  // Business offer dialog state
  const [showOfferDialog, setShowOfferDialog] = useState(false);
  // Image safety scanning state
  const [pendingSafetyImage, setPendingSafetyImage] = useState<{ url: string; file: File } | null>(null);
  const [showImageSafetyGate, setShowImageSafetyGate] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const addSticker = useAddSticker();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasMarkedReadRef = useRef<Set<string>>(new Set());
  const prevMessageCountRef = useRef(0);
  const openedConversationRef = useRef<string | null>(null);
  const messageNotifsClearedForConversationRef = useRef<string | null>(null);
  

  const otherMembers = useMemo(
    () =>
      safeConversation?.members?.filter(
        (m) => !isViewerMember(m.user_id, profileId, user?.id),
      ) || [],
    [safeConversation?.members, profileId, user?.id],
  );
  const resolvedOther = useMemo(
    () =>
      safeConversation
        ? resolveOtherMemberFromConversation(safeConversation, profileId, user?.id)
        : null,
    [safeConversation, profileId, user?.id],
  );
  const otherMember = resolvedOther?.profile as
    | { id?: string; username?: string; display_name?: string | null; avatar_url?: string | null; user_id?: string }
    | null
    | undefined;

  const groupPeerIds = useMemo(
    () =>
      isGroupChat
        ? otherMembers.map((m) => m.user_id).filter((id) => id && id !== profileId)
        : [],
    [isGroupChat, otherMembers, profileId],
  );

  const {
    peerPresence,
    peerPresences,
    presentUsers,
    typingUsers,
    setTyping,
    setRecordingVoice: setLiveRecordingVoice,
    setTakingPhoto: setLiveTakingPhoto,
    setUploadingImage,
    setUploadingVideo,
    setSendingVybe,
  } = useChatPresence(
    conversationId,
    isGroupChat ? groupPeerIds : otherMember?.id,
  );

  const groupDockPeer = useMemo(
    () => (isGroupChat ? pickGroupDockPeer(peerPresences) : null),
    [isGroupChat, peerPresences],
  );

  const peerLastReadAt = usePeerLastReadAt(
    !isGroupChat ? conversationId : undefined,
    !isGroupChat ? otherMember?.id : undefined,
  );

  const otherPresenceActivity = peerPresence?.activity ?? 'idle';
  const peerActivityUser = peerPresence;
  const showPeerPresence = !isGroupChat && !!peerPresence && otherPresenceActivity !== 'idle';

  useEffect(() => {
    setLiveTakingPhoto(cameraFirstMode || isCameraOpen);
    setSendingVybe(isCameraOpen);
    return () => {
      if (cameraFirstMode || isCameraOpen) setLiveTakingPhoto(false);
      if (isCameraOpen) setSendingVybe(false);
    };
  }, [cameraFirstMode, isCameraOpen, setLiveTakingPhoto, setSendingVybe]);

  const displayName = safeConversation
    ? displayNameForConversation(safeConversation, profileId, user?.id, 'Chat')
    : 'Chat';
  
  // Get online status for the other member (if DM)
  const presenceQuery = useUserOnlineStatus(
    !isGroupChat ? otherMember?.id : undefined
  );
  const otherMemberOnline = presenceQuery.data?.is_online ?? false;
  
  // Get streak with the other user (for DMs)
  const streak = useStreakWithUser(!isGroupChat ? otherMember?.id : undefined);
  
  // Check if user has a business profile for sending offers
  const { data: userBusiness } = useUserBusiness();

  // Clear bell notifications from this thread's senders (read state handled by useInstantReadClear)
  useEffect(() => {
    if (!profileId || !conversationId) return;
    if (messageNotifsClearedForConversationRef.current === conversationId) return;
    if (otherMembers.length === 0) return;

    messageNotifsClearedForConversationRef.current = conversationId;
    const otherMemberIds = otherMembers.map((m) => m.user_id);

    const run = () => {
      db
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profileId)
        .eq('type', 'message')
        .eq('read', false)
        .in('actor_id', otherMemberIds)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        });
    };

    let idleId: number;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 2500 });
    } else {
      idleId = window.setTimeout(run, 800) as unknown as number;
    }

    return () => {
      if (typeof requestIdleCallback !== 'undefined') cancelIdleCallback(idleId);
      else clearTimeout(idleId);
    };
  }, [conversationId, profileId, queryClient, otherMembers]);

  // Batch-mark messages as read after paint — avoids N mutations + cache thrash on open.
  const flushMessageViews = useCallback(async (messageIds: string[]) => {
    if (!conversationId || !profile?.id || messageIds.length === 0) return;

    const realIds = messageIds.filter((id) => typeof id === 'string' && !id.startsWith('temp-'));
    if (realIds.length === 0) return;

    const viewedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const idSet = new Set(realIds);

    try {
      await db.from('message_views').upsert(
        realIds.map((message_id) => ({ message_id, user_id: profile.id })),
        { onConflict: 'message_id,user_id', ignoreDuplicates: true },
      );

      const { data: expiryCandidates } = await db
        .from('messages')
        .select('id, view_mode, saved_by_sender, saved_by_recipient, expires_at')
        .in('id', realIds);

      const needExpiry = (expiryCandidates || []).filter(
        (m) =>
          m.view_mode === '24h' &&
          !m.saved_by_sender &&
          !m.saved_by_recipient &&
          !m.expires_at,
      );

      if (needExpiry.length > 0) {
        await Promise.all(
          needExpiry.map((m) =>
            db
              .from('messages')
              .update({ expires_at: expiresAt, viewed_at: viewedAt })
              .eq('id', m.id),
          ),
        );
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[ChatView] batch mark viewed failed:', err);
    }

    queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId), (old) => {
      if (!old?.some((m) => idSet.has(m.id))) return old;
      return old.map((m) => {
        if (!idSet.has(m.id)) return m;
        const nextExpires =
          m.view_mode === '24h' && !m.saved_by_sender && !m.saved_by_recipient
            ? m.expires_at || expiresAt
            : m.expires_at;
        return {
          ...m,
          viewed_at: m.viewed_at || viewedAt,
          expires_at: nextExpires,
          views: [
            ...(m.views || []).filter((v) => v.user_id !== profile.id),
            { user_id: profile.id, viewed_at: viewedAt },
          ],
        };
      });
    });
  }, [profile?.id, queryClient, conversationId]);

  // Auto-mark messages as read (EXCEPT VYBEs which require explicit tap-to-view)
  useEffect(() => {
    if (!messages || !profileId || !conversationId) return;

    const unreadIds: string[] = [];
    for (const msg of messages) {
      if (typeof msg.id === 'string' && msg.id.startsWith('temp-')) continue;
      if (msg.sender_id === profileId) continue;
      if (hasMarkedReadRef.current.has(msg.id)) continue;
      if (msg.media_type === 'vybe') continue;

      const hasMyView = safeMessageViews(msg).some((v) => v.user_id === profileId);
      if (hasMyView) continue;

      hasMarkedReadRef.current.add(msg.id);
      unreadIds.push(msg.id);
    }

    if (unreadIds.length === 0) return;

    const run = () => {
      void flushMessageViews(unreadIds);
    };

    let idleId: number;
    if (typeof requestIdleCallback !== 'undefined') {
      idleId = requestIdleCallback(run, { timeout: 1200 });
    } else {
      idleId = window.setTimeout(run, 400) as unknown as number;
    }

    return () => {
      if (typeof requestIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [messages, profileId, conversationId, flushMessageViews]);

  // Save chat scroll position on unmount (clips viewer return path).
  useEffect(() => {
    if (!conversationId) return;
    const container = messagesContainerRef.current;
    return () => {
      if (container) {
        saveElementScrollPosition(`chat-${conversationId}`, container.scrollTop);
      }
    };
  }, [conversationId]);

  // Scroll to bottom on open / new messages — avoid jumping on background refetches.
  useEffect(() => {
    if (!conversationId) return;

    const savedKey = `chat-${conversationId}`;
    const prevLen = prevMessageCountRef.current;
    const currentLen = messages?.length ?? 0;
    const isNewConversation = openedConversationRef.current !== conversationId;
    openedConversationRef.current = conversationId;
    prevMessageCountRef.current = currentLen;

    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) return;
      if (isNewConversation && restoreElementScrollPosition(savedKey, container)) {
        return;
      }
      if (isNewConversation || currentLen > prevLen) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [conversationId, messages?.length]);

  // Handle typing indicator - instant input, deferred typing updates
  const typingUpdateScheduledRef = useRef(false);
  
  // Imperatively writes to the input DOM node so we can clear/append
  // without forcing a parent re-render.
  const writeInputDom = useCallback((value: string) => {
    const el = inputRef.current;
    if (el && el.value !== value) {
      el.value = value;
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    // Update ref IMMEDIATELY (no re-render).
    messageTextRef.current = value;

    // Only flip parent state when the empty boundary changes — this is
    // what gates the send button vs. the sticker/voice cluster.
    const nowHas = value.length > 0;
    setHasText(prev => prev === nowHas ? prev : nowHas);

    // Auto-save draft to localStorage
    try {
      if (conversationId) {
        if (value.length > 0) {
          localStorage.setItem(`draft:${conversationId}`, value);
        } else {
          localStorage.removeItem(`draft:${conversationId}`);
        }
      }
    } catch { /* quota exceeded or private browsing */ }

    // Schedule typing indicator update (non-blocking)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (value.length > 0) {
      setTyping(true);
      typingUpdateScheduledRef.current = true;

      typingTimeoutRef.current = setTimeout(() => {
        typingUpdateScheduledRef.current = false;
        setTyping(false);
      }, 3000);
    } else {
      typingUpdateScheduledRef.current = false;
      setTyping(false);
    }
  }, [setTyping, conversationId]);

  // Append helper used by emoji pickers (still needs to update the DOM input).
  const appendToInput = useCallback((appended: string) => {
    const next = (messageTextRef.current || '') + appended;
    writeInputDom(next);
    handleInputChange(next);
  }, [writeInputDom, handleInputChange]);

  const handleSend = useCallback(() => {
    const raw = messageTextRef.current;
    if (!raw.trim() || !conversationId) return;

    // Clear draft on send
    try { localStorage.removeItem(`draft:${conversationId}`); } catch { /* */ }

    const text = raw.trim();

    // If we're in edit mode, update the message instead of sending a new one
    if (editingMessageId) {
      editMessage.mutate({ messageId: editingMessageId, newContent: text });
      setEditingMessageId(null);
      setEditText('');
      messageTextRef.current = '';
      writeInputDom('');
      setHasText(false);
      setTyping(false);
      return;
    }

    const replyId = replyingTo?.id;
    setReplyingTo(null);

    // Clear composer immediately — don't wait for server round-trip.
    messageTextRef.current = '';
    writeInputDom('');
    setHasText(false);
    setTyping(false);

    void sendText(text, viewMode, replyId).then(() => {
      if (!isGroupChat && otherMember?.id) {
        bumpStreak(otherMember.id);
      }
    }).catch(() => {
      messageTextRef.current = text;
      writeInputDom(text);
      setHasText(true);
    });
  }, [conversationId, viewMode, replyingTo, setTyping, sendText, editingMessageId, editMessage, isGroupChat, otherMember?.id, bumpStreak, writeInputDom]);


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
    if (!conversationId || !profileId) return;

    try {
      await sendMedia(mediaUrl, mediaType, viewMode, replyingTo?.id);
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to send media:', error);
      throw error;
    }
  }, [conversationId, profileId, viewMode, replyingTo?.id, sendMedia]);

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
    if (!file || !conversationId || !profileId) return;

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
  }, [conversationId, profileId]);

  // Process image after safety check passes
  const processApprovedImage = useCallback(async (file: File, previewUrl: string) => {
    if (!conversationId || !profileId) return;
    
    uploadingRef.current = true;
    setPendingImage({ url: previewUrl, file });
    setIsUploadingMedia(true);
    setUploadingImage(true);

    try {
      if (!profile.user_id) {
        toast.error('Account not ready yet, please refresh and try again');
        setIsUploadingMedia(false);
        uploadingRef.current = false;
        return;
      }
      
      // Compress image for faster upload
      const compressedBlob = await compressImage(file);
      const fileExt = file.type === 'image/png' ? 'png' : 'jpg';
      const fileName = `${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from('chat-media')
        .upload(fileName, compressedBlob, {
          contentType: `image/${fileExt}`,
          cacheControl: '31536000', // 1 year cache
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage
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
      setUploadingImage(false);
      uploadingRef.current = false;
    }
  }, [conversationId, profileId, compressImage, sendMediaMessage, setUploadingImage]);

  const handleVoiceRecordingComplete = useCallback(async (blob: Blob) => {
    if (!conversationId || !profileId) return;

    setIsUploadingMedia(true);

    try {
      // Guard: ensure auth user id exists for storage RLS
      if (!authUserId) {
        toast.error('Account not ready yet, please refresh and try again');
        setIsUploadingMedia(false);
        return;
      }
      
      const fileName = `${authUserId}/${Date.now()}.webm`;

      const { error: uploadError } = await db.storage
        .from('chat-media')
        .upload(fileName, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage
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
  }, [conversationId, profileId, authUserId]);

  // Handle direct file selection (from Toybox) - now goes through safety gate
  const handleDirectImageSelect = useCallback(async (file: File) => {
    if (!file || !conversationId || !profileId) return;
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
  }, [conversationId, profileId]);

  // Handle vybe camera send - uploads base64 image or blob video and sends as vybe
  // Uses optimistic UI - message appears immediately as "sending" then updates to "sent"
  // Phase-based error handling for better debugging
  const handleVybeSend = useCallback(async (mediaDataUrl: string, isVideo: boolean = false) => {
    if (!conversationId || !profileId) return;
    
    // Guard: ensure profile.user_id (auth ID) exists for storage RLS
    if (!profile.user_id) {
      toast.error('Account not ready yet, please refresh and try again');
      return;
    }

    // Validate mediaDataUrl is valid
    if (!mediaDataUrl || mediaDataUrl === 'undefined' || mediaDataUrl.length < 10) {
      toast.error('Invalid media data - please try again');
      console.error('[VYBE] Invalid mediaDataUrl:', mediaDataUrl?.substring(0, 50));
      return;
    }

    // Generate temp ID for optimistic UI
    const tempId = `vybe-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    let phase = 'init';
    
    // Show optimistic message IMMEDIATELY - don't wait for safety scan
    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      const optimisticMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: profileId,
        content: null,
        media_url: mediaDataUrl, // Show preview immediately
        media_type: 'vybe',
        message_type: 'text',
        view_mode: viewMode,
        expires_at: null,
        is_deleted: false,
        reply_to_id: replyingTo?.id || null,
        created_at: new Date().toISOString(),
        sender: {
          id: profileId,
          username: profile.username || '',
          avatar_url: profile.avatar_url || null,
          display_name: (profile as any).display_name || profile.username || null,
        },
        views: [],
        reactions: [],
        _sending: true, // Mark as sending
      } as any;
      
      if (!old) return [optimisticMessage];
      return [...old, optimisticMessage];
    });

    // Close camera overlay and show toast immediately
    try { stopCameraStream(); } catch {}
    toast.success(isVideo ? 'Sending video VYBE... 🎬' : 'Sending VYBE... ✨', { id: `vybe-${tempId}` });

    // Helper to mark message as failed with specific error
    const markFailed = (error: string, phaseInfo: string) => {
      console.error(`[VYBE] Failed at ${phaseInfo}:`, error);
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map(m => m.id === tempId ? { ...m, _failed: true, _error: error } as any : m);
      });
      toast.error(`Failed: ${error}`, { id: `vybe-${tempId}`, duration: 5000 });
    };

    void repairConversationForSend(conversationId, profileId, otherMember?.id ?? null).catch(() => {});

    const senderPushName =
      (profile as { display_name?: string }).display_name || profile.username || 'Someone';

    try {
      let mediaUrl: string;
      let uploadFile: File;
      
      if (isVideo) {
        // PHASE 1: Fetch blob from URL
        phase = 'blob-fetch';
        let videoBlob: Blob;
        try {
          const response = await fetch(mediaDataUrl);
          if (!response.ok) {
            throw new Error(`Fetch failed: ${response.status}`);
          }
          videoBlob = await response.blob();
          if (!videoBlob || videoBlob.size === 0) {
            throw new Error('Empty video blob');
          }
        } catch (fetchErr: any) {
          markFailed('Could not load video', phase);
          URL.revokeObjectURL(mediaDataUrl);
          return;
        }
        
        uploadFile = new File([videoBlob], `vybe_${Date.now()}.webm`, { type: videoBlob.type || 'video/webm' });
        
        const scanPromise = nsfwScanVideo(uploadFile).catch(() => ({ result: 'allowed' as const }));
        void scanPromise.then((scanResult) => {
          if (scanResult?.result === 'blocked') {
            queryClient.setQueryData<Message[]>(['messages', conversationId], (old) =>
              old?.filter(m => m.id !== tempId) || []
            );
            toast.error(scanResult.message || 'Video blocked by safety filter.', { id: `vybe-${tempId}` });
          }
        });

        // PHASE 3: Upload to storage (don't wait on safety scan)
        phase = 'storage-upload';
        const fileName = `${profile.user_id}/${Date.now()}_vybe.webm`;
        const { error: uploadError } = await db.storage
          .from('chat-media')
          .upload(fileName, uploadFile, {
            contentType: uploadFile.type,
            cacheControl: '31536000',
          });

        if (uploadError) {
          markFailed(`Upload failed: ${uploadError.message}`, phase);
          URL.revokeObjectURL(mediaDataUrl);
          return;
        }

        const { data: { publicUrl } } = db.storage
          .from('chat-media')
          .getPublicUrl(fileName);

        mediaUrl = publicUrl;
        
        // Validate URL
        if (!mediaUrl || mediaUrl.includes('undefined')) {
          markFailed('Failed to get media URL', phase);
          URL.revokeObjectURL(mediaDataUrl);
          return;
        }
        
        URL.revokeObjectURL(mediaDataUrl);
      } else {
        // Image vybe — compress then upload (faster send + faster recipient load)
        phase = 'image-parse';
        if (!mediaDataUrl || mediaDataUrl.length < 10) {
          markFailed('Invalid image data', phase);
          return;
        }

        let blob: Blob;
        try {
          blob = await compressVybeDataUrl(mediaDataUrl);
        } catch {
          const base64Data = mediaDataUrl.split(',')[1];
          if (!base64Data || base64Data.length < 10) {
            markFailed('Invalid image data', phase);
            return;
          }
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/jpeg' });
        }

        const imageFile = new File([blob], 'vybe.jpg', { type: 'image/jpeg' });
        void nsfwScanImage(imageFile)
          .then((scanResult) => {
            if (scanResult?.result === 'blocked') {
              queryClient.setQueryData<Message[]>(['messages', conversationId], (old) =>
                old?.filter(m => m.id !== tempId) || []
              );
              toast.error(scanResult.message || 'Image blocked by safety filter.', { id: `vybe-${tempId}` });
            }
          })
          .catch(() => {});

        phase = 'storage-upload';
        
        const fileName = `${profile.user_id}/${Date.now()}_vybe.jpg`;
        const { error: uploadError } = await db.storage
          .from('chat-media')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
            cacheControl: '31536000',
          });

        if (uploadError) {
          markFailed(`Upload failed: ${uploadError.message}`, phase);
          return;
        }

        const { data: { publicUrl } } = db.storage
          .from('chat-media')
          .getPublicUrl(fileName);

        mediaUrl = publicUrl;
        
        if (!mediaUrl || mediaUrl.includes('undefined')) {
          markFailed('Failed to get media URL', phase);
          return;
        }
      }

      phase = 'db-insert';

      const expiresAt = expiresAtForViewMode('view_once');

      const { data: realMessage, error: sendError } = await insertDmMessage(
        {
          conversation_id: conversationId,
          sender_id: profileId,
          content: null,
          media_url: mediaUrl,
          media_type: 'vybe',
          message_type: 'text',
          view_mode: 'view_once',
          expires_at: expiresAt,
          reply_to_id: replyingTo?.id ?? null,
        },
        {
          otherProfileId: otherMember?.id ?? null,
          push: {
            senderName: senderPushName,
            preview: isVideo ? '🎬 New Snap' : '📸 New Snap',
          },
        },
      );

      if (sendError || !realMessage) {
        console.error('[VYBE] DB insert error:', sendError);
        markFailed(`Send failed: ${sendError?.message || 'Unknown error'}`, phase);
        return;
      }

      console.log('[VYBE] Message inserted successfully:', realMessage.id);

      replaceOptimisticMessage(queryClient, conversationId, tempId, {
        ...realMessage,
        view_mode: 'view_once',
      });

      void sendDmBroadcastMessage(conversationId, {
        ...realMessage,
        view_mode: viewMode,
      });

      void bumpConversationUpdatedAt(conversationId);

      setReplyingTo(null);
      toast.success(isVideo ? 'Video VYBE sent! 🎬✨' : 'VYBE sent! ✨', { id: `vybe-${tempId}` });
      
    } catch (error: any) {
      console.error(`[VYBE] Unexpected error at phase ${phase}:`, error);
      
      // Mark message as failed in UI
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map(m => m.id === tempId ? { ...m, _failed: true, _error: error?.message } as any : m);
      });
      
      toast.error(`Failed to send VYBE: ${error?.message || 'Unknown error'}`, { id: `vybe-${tempId}`, duration: 5000 });
    }
  }, [conversationId, profile, profileId, viewMode, replyingTo?.id, queryClient, otherMember?.id]);

  const handleOpenSnapCamera = useCallback(() => {
    if (callStore.state.phase !== 'idle') {
      toast.error('End your call to use the camera');
      return;
    }
    openCameraFromGesture(openCamera, 'dm', {
      onSend: (url, isVideo) => {
        void handleVybeSend(url, isVideo);
      },
    });
  }, [callStore.state.phase, openCamera, handleVybeSend]);

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
    if (!conversationId || !profileId) return;
    
    try {
      setUploadingVideo(true);
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
    } finally {
      setUploadingVideo(false);
    }
  }, [conversationId, profileId, viewMode, replyingTo?.id, sendVideo, setUploadingVideo]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    // Auto-focus input and bring up keyboard after swipe-to-reply
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    });
  }, []);

  const clearReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  // Scroll to a specific message by ID with highlight
  const scrollToMessage = useCallback((messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight flash
      element.classList.add('animate-pulse', 'ring-2', 'ring-primary/50');
      setTimeout(() => {
        element.classList.remove('animate-pulse', 'ring-2', 'ring-primary/50');
      }, 1500);
    }
  }, []);

  // Memoize message items to prevent re-renders - using stable keys
  const memberProfileByUserId = useMemo(() => {
    const map = new Map<string, NonNullable<Message['sender']>>();
    for (const member of ensureArray(safeConversation?.members)) {
      if (member.user_id && member.profile) {
        map.set(member.user_id, member.profile as NonNullable<Message['sender']>);
        if (member.profile.id) map.set(member.profile.id, member.profile as NonNullable<Message['sender']>);
      }
    }
    if (otherMember?.id) {
      const om = otherMember as NonNullable<Message['sender']>;
      map.set(otherMember.id, om);
      const authId = (otherMember as { user_id?: string }).user_id;
      if (authId) map.set(authId, om);
    }
    return map;
  }, [safeConversation?.members, otherMember]);

  // Enhanced spacing logic for Instagram/iMessage quality
  const messageItems = useMemo(() => {
    if (!messages) return [];
    return messages.map((message, index) => {
      const isOwn =
        message.sender_id === profileId ||
        message.sender_id === profile?.id ||
        message.sender_id === authUserId;
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
      const isEmojiOnly =
        typeof message.content === 'string' &&
        message.content &&
        !message.media_url &&
        /^[\p{Emoji}\s]+$/u.test(message.content.trim()) &&
        message.content.trim().length <= 8;

      return { message, isOwn, showAvatar, showTimestamp, sameSender, isMediaTransition, isEmojiOnly };
    });
  }, [messages, profileId, profile?.id, authUserId]);

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

  if (messagesFetched && messagesError && !messages?.length && !!conversationId) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load this conversation.</p>
        <Button size="sm" variant="secondary" onClick={() => refetchMessages()}>
          Try again
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/messages')}>
          Back to messages
        </Button>
      </div>
    );
  }

  const showConversationSkeleton =
    !!conversationId &&
    !conversation &&
    !messages?.length &&
    conversationPending &&
    !conversationFetched;
  const showMessagesSkeleton =
    !!conversationId &&
    !messages?.length &&
    messagesPending &&
    !messagesFetched;
  const isChatHydrating = showConversationSkeleton || showMessagesSkeleton;

  const messagesLoadFailed =
    !!conversation &&
    messagesFetched &&
    messagesError &&
    !messages?.length;

  return (
    <div
      id={CHAT_SHIELD_ROOT_ID}
      className="flex flex-col h-full min-h-0 dm-chat-shell relative overflow-hidden"
      style={{ touchAction: 'pan-y' }}
    >
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


      {/* Floating pill header — back + profile left, calls + menu right */}
      <header
        className="dm-chat-header px-2 sm:px-3"
        style={{ paddingTop: 'calc(var(--sat, env(safe-area-inset-top, 0px)) + 0.75rem)' }}
      >
        <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
          <div className="dm-chat-header-pill dm-chat-header-pill--profile">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/messages')}
              className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>

            <button
              type="button"
              onClick={handleAvatarClick}
              className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 text-left group"
              aria-label={isGroupChat ? 'View group info' : 'View profile'}
            >
              {isGroupChat ? (
                <div className="relative h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-accent to-primary opacity-60" />
                  <div className="absolute inset-[2px] rounded-full overflow-hidden bg-background">
                    <Avatar className="h-full w-full">
                      {conversation?.avatar_url ? (
                        <AvatarImage src={conversation.avatar_url} />
                      ) : (
                        <AvatarFallback className="text-sm bg-muted text-foreground">
                          <Users className="h-4 w-4" />
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-background">
                    {otherMembers.length + 1}
                  </div>
                </div>
              ) : (
                <ChatHeaderPresenceAvatar
                  avatarUrl={peerPresence?.avatar_url ?? otherMember?.avatar_url}
                  fallbackAvatarUrl={otherMember?.avatar_url}
                  username={otherMember?.username || otherMember?.display_name || ''}
                  activity={showPeerPresence ? otherPresenceActivity : 'idle'}
                  isOnline={otherMemberOnline || !!peerPresence}
                />
              )}

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm sm:text-base truncate leading-tight flex items-center gap-1.5">
                  {!isGroupChat && otherMember?.id ? (
                    <StyledUsername
                      userId={otherMember.id}
                      username={otherMember.username || ''}
                      displayName={otherMember.display_name}
                      preferDisplayName={true}
                    />
                  ) : (
                    displayName
                  )}
                  {!isGroupChat && otherMember?.id && isOwner(otherMember.username || '') && <OwnerBadge />}
                  {!isGroupChat && otherMember?.id && isOwnerWife(otherMember.id) && <OwnerWifeRingBadge />}
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
                  <GroupPresenceBar
                    peers={peerPresences}
                    memberCount={otherMembers.length + 1}
                    onTapInfo={() => setShowGroupInfo(true)}
                  />
                ) : (
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight truncate flex items-center gap-1 min-w-0">
                    <LivePresenceBar
                      isOnline={otherMemberOnline || !!peerPresence}
                      isTyping={otherPresenceActivity === 'typing'}
                      isInChat={otherPresenceActivity === 'viewing'}
                      isInCamera={
                        otherPresenceActivity === 'taking_photo' ||
                        otherPresenceActivity === 'recording_video' ||
                        otherPresenceActivity === 'sending_vybe'
                      }
                      activity={otherPresenceActivity}
                      username={otherMember?.username}
                      lastReadAt={lastReadAt}
                    />
                  </p>
                )}
              </div>
            </button>
          </div>

          <div className="dm-chat-header-pill dm-chat-header-pill--actions">
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="flex-shrink-0 h-8 w-8 rounded-full hover:bg-white/10">
                  <MoreVertical className="h-4 w-4" />
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
          </div>
        </div>

        <EphemeralChatNotice
          viewMode={viewMode}
          isGroupChat={isGroupChat}
          onViewModeChange={setViewMode}
          compact
        />
      </header>

      {/* DM Feature Sheets - triggered from Toybox */}
      {conversationId && (
        <>
      <VanishThreadsSheet conversationId={conversationId} open={showVanishThreads} onOpenChange={setShowVanishThreads} />
      <MemoryPinsSheet conversationId={conversationId} messages={messages || []} open={showMemoryPins} onOpenChange={setShowMemoryPins} />
      <ScheduleMessageSheet conversationId={conversationId} open={showScheduleMessage} onOpenChange={setShowScheduleMessage} />
      <DMSettingsSheetControlled conversationId={conversationId} open={showDMSettings} onOpenChange={setShowDMSettings} />
        </>
      )}
      
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
          creatorId={safeDmMembers(safeConversation?.members).find(m => m.role === 'owner')?.user_id}
        />
      )}

      {/* Pre-call Media Settings */}
      <CallSettingsSheet
        isOpen={showMediaSettings}
        onOpenChange={setShowMediaSettings}
        isVideoCall={true}
      />


      {/* Messages - scrollable area with edge-to-edge bubbles */}
      <div 
        ref={messagesContainerRef}
        className={cn(
          "dm-chat-messages flex-1 overflow-y-auto overflow-x-hidden min-h-0",
          "px-3 sm:px-4 pb-3",
          "scroll-smooth",
          getWallpaperClass()
        )}
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
      >
        {messagesLoadFailed && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground mb-2">Couldn&apos;t load messages.</p>
            <Button size="sm" variant="secondary" onClick={() => refetchMessages()}>
              Try again
            </Button>
          </div>
        )}
        {isChatHydrating ? (
          <div className="flex flex-col gap-3 py-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <Skeleton className="h-11 w-44 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
        <div className="flex flex-col gap-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:pb-4">
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
            const isCallEvent = message.message_type === 'call_event';
            const isCaptureNotification = isScreenshotNotification || isRecordingNotification;

            const wrapMessageRow = (row: ReactNode) => (
              <LocalErrorBoundary key={message.id} label="chat-message">
                {row}
              </LocalErrorBoundary>
            );
            
            if (isCallEvent) {
              return wrapMessageRow(
                <div className={cn(spacingClass, index === 0 && 'pt-0')}>
                  {showTimestamp && (
                    <div className="text-center py-5 sm:py-6">
                      <span className="text-[10px] sm:text-[11px] text-muted-foreground/50 bg-muted/30 px-3 py-1 rounded-full font-medium">
                        {formatMessageDate(message.created_at)}
                      </span>
                    </div>
                  )}
                  <CallEventBubble
                    content={message.content}
                    isOwn={isOwn}
                    callTypeHint={message.media_type === 'video' ? 'video' : 'audio'}
                  />
                </div>
              );
            }

            if (isCaptureNotification) {
              const isRecording = message.content?.includes('started') || message.content?.includes('possible');
              const isStopped = message.content?.includes('stopped');
              
              return wrapMessageRow(
                <div className={cn(spacingClass, index === 0 && 'pt-0')}>
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
                        ? "bg-primary/10 border-primary/25 text-foreground"
                        : isRecording
                          ? "bg-destructive/10 border-destructive/25 text-destructive"
                          : isStopped
                            ? "bg-muted/50 border-border/30 text-muted-foreground"
                            : "bg-primary/10 border-primary/20 text-muted-foreground"
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
            
            return wrapMessageRow(
              <div 
                className={cn(spacingClass, index === 0 && 'pt-0')}
              >
                {showTimestamp && (
                  <div className="text-center py-5 sm:py-6">
                    <span className="text-[10px] sm:text-[11px] text-muted-foreground/50 bg-muted/30 px-3 py-1 rounded-full font-medium">
                      {formatMessageDate(message.created_at)}
                    </span>
                  </div>
                )}
                {/* Swipe = reply only, hold = menu only, tap = bubble/media behavior */}
                <SwipeToReply
                  onReply={() => handleReply(message)}
                  onLongPress={() => setShowContextMenuMessageId(message.id)}
                  isOwn={isOwn}
                >
                  <MessageBubble
                    message={message}
                    isOwn={isOwn}
                    showAvatar={showAvatar}
                    sender={message.sender || memberProfileByUserId.get(message.sender_id)}
                    isGroupChat={isGroupChat}
                    onView={() => markViewed.mutate(message.id)}
                    onReaction={handleReaction}
                    onReply={() => handleReply(message)}
                    onUnsendForEveryone={() => unsendForEveryone.mutate(message.id)}
                    onDeleteForMe={() => deleteForMe.mutate(message.id)}
                    onEdit={() => {
                      setEditingMessageId(message.id);
                      setEditText(message.content || '');
                      messageTextRef.current = message.content || '';
                      writeInputDom(message.content || '');
                      setHasText((message.content || '').length > 0);
                      inputRef.current?.focus();
                    }}
                    onSaveSticker={(url) => addSticker.mutate(url)}
                    allMessages={messages}
                    themeColor={THEME_COLORS[settings.theme] || THEME_COLORS.default}
                    showReactions={activeReactionMessageId === message.id}
                    onToggleReactions={() => setActiveReactionMessageId(
                      activeReactionMessageId === message.id ? null : message.id
                    )}
                    profileId={profileId}
                    isEmojiOnly={isEmojiOnly}
                    onNavigateToPost={(postId) => navigate(`/clips/${postId}`, { state: { from: 'messages', conversationId } })}
                    onScrollToMessage={scrollToMessage}
                    forceShowContextMenu={showContextMenuMessageId === message.id}
                    onCloseContextMenu={() => setShowContextMenuMessageId(null)}
                    onToggleSaved={!isGroupChat ? () => toggleSaved.mutate(message.id) : undefined}
                    onRetry={
                      isOwn && (message as { _failed?: boolean })._failed
                        ? () => retryMessage(message.id)
                        : undefined
                    }
                    peerLastReadAt={!isGroupChat ? peerLastReadAt : undefined}
                    conversationId={conversationId}
                    onScreenshotCapture={() => notifyCapture('screenshot')}
                    onVybeReplayExhausted={() => markVybeReplayExhausted.mutate(message.id)}
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

          {/* Group chat presence indicator */}
          {isGroupChat && presentUsers && presentUsers.length > 0 && (
            <ChatPresenceIndicator
              presentUsers={presentUsers}
              typingUserIds={typingUsers || []}
              maxDisplay={3}
            />
          )}

          {/* Safety filter request popup */}
          {conversationSafety.hasPendingRequest && !conversationSafety.isRequester && !conversationSafety.hasCurrentUserResponded && otherMember && (
            <SafetyFilterRequest
              visible
              requesterName={otherMember.display_name || otherMember.username || 'User'}
              isGroupChat={isGroupChat}
              isUnder13={conversationSafety.isUnder13}
              onAccept={() => conversationSafety.respondToRequest.mutate('accepted')}
              onDecline={() => conversationSafety.respondToRequest.mutate('declined')}
              isLoading={conversationSafety.respondToRequest.isPending}
            />
          )}


          <div ref={messagesEndRef} className="h-1" />
        </div>
        )}
      </div>


      {/* Camera-First Overlay */}
      <CameraFirstOverlay
        isOpen={cameraFirstMode}
        recipientName={displayName}
        recipientAvatar={otherMember?.avatar_url || undefined}
        onClose={() => setCameraFirstMode(false)}
        onSend={(mediaUrl, isVideo) => {
          setCameraFirstMode(false);
          handleVybeSend(mediaUrl, isVideo);
        }}
        onOpenChat={() => setCameraFirstMode(false)}
      />

      {/* VYBE Camera Modal — only mount when open to avoid heavy AR/MediaPipe init in DM view */}
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
        <DMSafetyGate
          targetUserId={otherMember.id}
          targetUsername={otherMember.username || ''}
          hasActiveConversation={Boolean(conversationId)}
        >
          <MessageInputArea
            presenceSlot={
              !isGroupChat && showPeerPresence && peerActivityUser ? (
                <ChatPresenceDock
                  avatarUrl={peerActivityUser.avatar_url ?? otherMember?.avatar_url}
                  username={peerActivityUser.username || otherMember?.username || ''}
                  activity={otherPresenceActivity}
                />
              ) : undefined
            }
            hasText={hasText}
            getMessageText={() => messageTextRef.current}
            appendToInput={appendToInput}
            viewMode={viewMode}
            showViewModeMenu={showViewModeMenu}
            setShowViewModeMenu={setShowViewModeMenu}
            isRecordingVoice={isRecordingVoice}
            isUploadingMedia={isUploadingMedia}
            replyingTo={replyingTo}
            isPending={false}
            inputRef={inputRef}
            inputContainerRef={inputContainerRef}
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
            onOpenSnapCamera={handleOpenSnapCamera}
            onCreateOffer={userBusiness ? () => setShowOfferDialog(true) : undefined}
            hasBusinessProfile={!!userBusiness}
            presentUsers={presentUsers}
            typingUserIds={typingUsers}
            editingMessageId={editingMessageId}
            onCancelEdit={() => { setEditingMessageId(null); setEditText(''); }}
            showStickerPanel={showStickerPanel}
            setShowStickerPanel={setShowStickerPanel}
            onSendSticker={async (url) => {
              await sendMediaMessage(url, 'image');
              setShowStickerPanel(false);
            }}
            isVoiceLocked={isVoiceLocked}
            setIsVoiceLocked={setIsVoiceLocked}
            voiceLockStartYRef={voiceLockStartYRef}
            messagesContainerRef={messagesContainerRef}
            safetyFilterNode={
              <SafetyFilterRequestButton
                isSafetyDisabled={conversationSafety.isSafetyDisabled}
                hasPendingRequest={conversationSafety.hasPendingRequest}
                isUnder13={conversationSafety.isUnder13}
                isRequester={conversationSafety.isRequester}
                onRequestDisable={() => conversationSafety.requestDisable.mutate()}
                onReEnable={() => conversationSafety.reEnable.mutate()}
              />
            }
          />
        </DMSafetyGate>
      ) : (
        <>
          <MessageInputArea
          presenceSlot={
            isGroupChat && groupDockPeer ? (
              <ChatPresenceDock
                avatarUrl={groupDockPeer.avatar_url}
                username={groupDockPeer.username}
                activity={groupDockPeer.activity}
              />
            ) : !isGroupChat && showPeerPresence && peerActivityUser ? (
              <ChatPresenceDock
                avatarUrl={peerActivityUser.avatar_url ?? otherMember?.avatar_url}
                username={peerActivityUser.username || otherMember?.username || ''}
                activity={otherPresenceActivity}
              />
            ) : undefined
          }
          hasText={hasText}
          getMessageText={() => messageTextRef.current}
          appendToInput={appendToInput}
          viewMode={viewMode}
          showViewModeMenu={showViewModeMenu}
          setShowViewModeMenu={setShowViewModeMenu}
          isRecordingVoice={isRecordingVoice}
          isUploadingMedia={isUploadingMedia}
          replyingTo={replyingTo}
          isPending={false}
          inputRef={inputRef}
          inputContainerRef={inputContainerRef}
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
          onOpenSnapCamera={handleOpenSnapCamera}
          onCreateOffer={userBusiness ? () => setShowOfferDialog(true) : undefined}
          hasBusinessProfile={!!userBusiness}
          presentUsers={presentUsers}
          typingUserIds={typingUsers}
          editingMessageId={editingMessageId}
          onCancelEdit={() => { setEditingMessageId(null); setEditText(''); }}
          showStickerPanel={showStickerPanel}
          setShowStickerPanel={setShowStickerPanel}
          onSendSticker={async (url) => {
            await sendMediaMessage(url, 'image');
            setShowStickerPanel(false);
          }}
          isVoiceLocked={isVoiceLocked}
          setIsVoiceLocked={setIsVoiceLocked}
          voiceLockStartYRef={voiceLockStartYRef}
          messagesContainerRef={messagesContainerRef}
          safetyFilterNode={
            <SafetyFilterRequestButton
              isSafetyDisabled={conversationSafety.isSafetyDisabled}
              hasPendingRequest={conversationSafety.hasPendingRequest}
              isUnder13={conversationSafety.isUnder13}
              isRequester={conversationSafety.isRequester}
              onRequestDisable={() => conversationSafety.requestDisable.mutate()}
              onReEnable={() => conversationSafety.reEnable.mutate()}
            />
          }
        />
        </>
      )}

      {/* Business Offer Dialog */}
      {userBusiness && conversationId && profile && otherMember && (
        <CreateOfferDialog
          open={showOfferDialog}
          onOpenChange={setShowOfferDialog}
          conversationId={conversationId}
          recipientId={otherMember.id}
          businessId={userBusiness.id}
          senderId={profileId}
        />
      )}
    </div>
  );
}

// Extracted MessageInputArea component for reuse
const MessageInputArea = memo(function MessageInputArea({
  hasText,
  getMessageText,
  appendToInput,
  viewMode,
  showViewModeMenu,
  setShowViewModeMenu,
  isRecordingVoice,
  isUploadingMedia,
  replyingTo,
  isPending,
  inputRef,
  inputContainerRef,
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
  onCreateOffer,
  hasBusinessProfile,
  presentUsers,
  typingUserIds,
  editingMessageId,
  onCancelEdit,
  showStickerPanel,
  setShowStickerPanel,
  onSendSticker,
  isVoiceLocked,
  setIsVoiceLocked,
  voiceLockStartYRef,
  safetyFilterNode,
  messagesContainerRef,
  presenceSlot,
}: {
  hasText: boolean;
  getMessageText: () => string;
  appendToInput: (s: string) => void;
  viewMode: ViewMode;
  showViewModeMenu: boolean;
  setShowViewModeMenu: (open: boolean) => void;
  isRecordingVoice: boolean;
  isUploadingMedia: boolean;
  replyingTo: Message | null;
  isPending: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  inputContainerRef: React.RefObject<HTMLDivElement>;
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
  onCreateOffer?: () => void;
  hasBusinessProfile?: boolean;
  presentUsers?: { user_id: string; username: string; avatar_url: string | null; display_name: string | null; is_typing: boolean }[];
  typingUserIds?: string[];
  editingMessageId?: string | null;
  onCancelEdit?: () => void;
  showStickerPanel?: boolean;
  setShowStickerPanel?: (open: boolean) => void;
  onSendSticker?: (imageUrl: string) => void;
  isVoiceLocked?: boolean;
  setIsVoiceLocked?: (locked: boolean) => void;
  voiceLockStartYRef?: React.MutableRefObject<number | null>;
  safetyFilterNode?: React.ReactNode;
  messagesContainerRef?: React.RefObject<HTMLElement | null>;
  presenceSlot?: React.ReactNode;
}) {
  const headerSlot = (
    <>
      {editingMessageId && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-primary/10 rounded-xl border-l-2 border-primary">
          <Pencil className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <p className="text-[11px] text-primary font-medium flex-1">Editing message</p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelEdit}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {replyingTo && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-muted/40 rounded-xl border-l-2 border-primary/80">
          <CornerUpLeft className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-primary font-medium">
              Replying to {replyingTo.sender?.username || 'message'}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {replyingTo.content || (replyingTo.media_type === 'image' ? '📷 Photo' : '🎤 Voice message')}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearReply}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </>
  );

  return (
    <KeyboardAwareTexter scrollContainerRef={messagesContainerRef}>
      {presenceSlot ? (
        <div className="dm-presence-above-composer">{presenceSlot}</div>
      ) : null}
      <div className="dm-composer-dock relative flex-shrink-0 z-30">
        {onSendSticker && showStickerPanel && setShowStickerPanel && (
          <StickerPanel
            open={showStickerPanel}
            onClose={() => setShowStickerPanel(false)}
            onSendSticker={onSendSticker}
          />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
        />

        <Texter
          hasText={hasText}
          getMessageText={getMessageText}
          appendToInput={appendToInput}
          inputRef={inputRef}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onSend={handleSend}
          onFocus={() => {
            if (shouldTrackSoftKeyboard()) {
              requestAnimationFrame(() => {
                inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
              });
            }
          }}
          isPending={isPending}
          isUploadingMedia={isUploadingMedia}
          placeholder={t('messages.typeMessage')}
          headerSlot={headerSlot}
          onOpenVybeSnap={onOpenSnapCamera}
          isRecordingVoice={isRecordingVoice}
          isVoiceLocked={isVoiceLocked}
          onVoiceHoldStart={() => {
            if (voiceLockStartYRef) voiceLockStartYRef.current = null;
            setIsRecordingVoice(true);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(true);
          }}
          onVoiceHoldEnd={() => {
            if (isVoiceLocked) return;
            const stop = (window as Window & { __voiceRecorderStop?: () => void }).__voiceRecorderStop;
            stop?.();
          }}
          onVoiceHoldCancel={() => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
          }}
          onVoiceHoldMove={(clientX, clientY) => {
            if (!isRecordingVoice || isVoiceLocked || !voiceLockStartYRef) return;
            if (voiceLockStartYRef.current == null) voiceLockStartYRef.current = clientY;
            const dy = voiceLockStartYRef.current - clientY;
            if (dy > 48) {
              setIsVoiceLocked?.(true);
              voiceLockStartYRef.current = null;
            }
          }}
          onVoiceRecordingComplete={(blob) => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
            handleVoiceRecordingComplete(blob);
          }}
          onVoiceRecordingCancel={() => {
            setIsRecordingVoice(false);
            setIsVoiceLocked?.(false);
            onLiveRecordingChange?.(false);
          }}
          toyboxProps={{
            onImageSelect: async (file) => {
              const dt = new DataTransfer();
              dt.items.add(file);
              handleImageSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
            },
            onVideoSelect: handleVideoSelect,
            onGifSelect: async (gifUrl) => {
              await sendMediaMessage(gifUrl, 'gif');
            },
            onVoiceStart: () => {
              setIsRecordingVoice(true);
              onLiveRecordingChange?.(true);
            },
            onEmojiSelect: (emoji) => {
              appendToInput(emoji);
              inputRef.current?.focus();
            },
            isUploading: isUploadingMedia,
            onOpenVanishThreads,
            onOpenMemoryPins,
            onOpenScheduleMessage,
            onOpenDMSettings,
            onOpenAdminPanel,
            onOpenVybeCamera: onOpenSnapCamera,
            onCreateOffer,
            hasBusinessProfile,
            safetyFilterNode,
            triggerClassName: 'texter-icon-btn texter-icon-btn--tool',
          }}
        />
      </div>
    </KeyboardAwareTexter>
  );
});

// Signed avatar for message bubbles (storage URLs need signing)
const BubbleAvatar = memo(function BubbleAvatar({
  sender,
}: {
  sender?: Message['sender'];
}) {
  return (
    <SignedAvatar
      src={sender?.avatar_url}
      alt={sender?.username || 'User'}
      fallback={sender?.display_name || sender?.username || '?'}
      className="h-8 w-8 sm:h-9 sm:w-9 ring-1 ring-background shadow-sm"
    />
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
  onScrollToMessage,
  onSaveSticker,
  forceShowContextMenu = false,
  onCloseContextMenu,
  onToggleSaved,
  onRetry,
  peerLastReadAt,
  conversationId,
  onScreenshotCapture,
  onVybeReplayExhausted,
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
  onSaveSticker?: (url: string) => void;
  allMessages?: Message[];
  themeColor?: { bubble: string; text: string };
  showReactions: boolean;
  onToggleReactions: () => void;
  profileId?: string;
  isEmojiOnly?: boolean;
  onNavigateToPost?: (postId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  forceShowContextMenu?: boolean;
  onCloseContextMenu?: () => void;
  onToggleSaved?: () => void;
  onRetry?: () => void;
  peerLastReadAt?: string | null;
  conversationId?: string;
  onScreenshotCapture?: () => void;
  onVybeReplayExhausted?: () => void;
}) {
  const [isViewed, setIsViewed] = useState(false);
  const failed = Boolean((message as { _failed?: boolean })._failed);
  const iViewedVybe = Boolean(profileId && safeMessageViews(message).some((v) => v.user_id === profileId));
  const recipientViewedVybe = Boolean(safeMessageViews(message).some((v) => v.user_id !== message.sender_id));
  const vybeState = getVybeRecipientState(message, profileId);
  const vybeViewed = isOwn ? recipientViewedVybe : vybeState !== 'unopened';
  const [showVybeViewer, setShowVybeViewer] = useState(false);
  const [isReplaySession, setIsReplaySession] = useState(false);
  const replayHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<{ url: string; type: 'image' | 'gif' | 'video'; senderName?: string; timestamp?: string } | null>(null);
  const isContextMenuOpen = showContextMenu || forceShowContextMenu;
  const bubbleWrapperRef = useRef<HTMLDivElement>(null);
  const [reactionsFlipBelow, setReactionsFlipBelow] = useState(false);

  useLayoutEffect(() => {
    if (!showReactions) { setReactionsFlipBelow(false); return; }
    const el = bubbleWrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Pill is ~44px tall + 8px gap. Flip if not enough headroom.
    setReactionsFlipBelow(r.top < 64);
  }, [showReactions]);

  const repliedMessage = useMemo(() => 
    message.reply_to_id ? ensureArray(allMessages).find(m => m.id === message.reply_to_id) : null,
    [message.reply_to_id, allMessages]
  );

  useEffect(() => {
    if (!isOwn && message.view_mode === 'view_once' && message.media_type !== 'vybe' && !isViewed) {
      onView();
      setIsViewed(true);
    }
  }, [isOwn, message.view_mode, message.media_type, isViewed, onView]);

  const hasBeenViewed = message.views && message.views.length > 0;
  
  const uniqueReactions = useMemo(() => {
    const reactions = Array.isArray(message.reactions) ? message.reactions : [];
    const userReactionMap = new Map<string, string>();
    
    reactions.forEach(r => {
      userReactionMap.set(r.user_id, r.emoji);
    });
    
    const emojiCounts = new Map<string, number>();
    userReactionMap.forEach(emoji => {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
    });
    
    return Array.from(emojiCounts.entries()).slice(0, 3);
  }, [message.reactions]);

  const userReaction = useMemo(() => {
    if (!profileId) return null;
    return safeMessageReactions(message).find(r => r.user_id === profileId)?.emoji || null;
  }, [message.reactions, profileId]);

  const smartEmojis = useMemo(() => getTopEmojis(6), []);

  const closeContextMenu = useCallback(() => {
    setShowContextMenu(false);
    onCloseContextMenu?.();
  }, [onCloseContextMenu]);

  const handleReaction = useCallback((emoji: string) => {
    recordEmoji(emoji);
    onReaction(message.id, emoji);
    onToggleReactions();
    closeContextMenu();
  }, [message.id, onReaction, onToggleReactions, closeContextMenu]);

  const handleUnsend = useCallback(() => {
    onUnsendForEveryone();
    closeContextMenu();
  }, [onUnsendForEveryone, closeContextMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowContextMenu(true);
  }, []);

  const handleMediaTap = useCallback(() => {
    if (isContextMenuOpen) return;
    if (message.media_url && (message.media_type === 'image' || message.media_type === 'gif' || message.media_type === 'video')) {
      setViewerMedia({
        url: message.media_url,
        type: message.media_type as 'image' | 'gif' | 'video',
        senderName: isOwn ? 'You' : (sender?.username || undefined),
        timestamp: message.created_at,
      });
    }
  }, [isContextMenuOpen, message.media_url, message.media_type, message.created_at, isOwn, sender?.username]);

  // Check if this is an audio message for proper sizing
  const isAudioMessage = message.media_url && message.media_type === 'audio';
  const isMediaMessage = message.media_url && (message.media_type === 'image' || message.media_type === 'gif');
  const isVideoMessage = message.media_url && message.media_type === 'video';
  const isVybeMessage = message.media_type === 'vybe';
  const isSharedPost = message.message_type === 'shared_post';
  const isSharedTheme = message.message_type === 'shared_theme';

  return (
    <div 
      id={`message-${message.id}`}
      className={cn(
        'flex w-full group/message relative rounded-lg',
        isOwn ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Container for avatar + bubble - left aligned for received */}
      <div className={cn(
        'flex gap-2 sm:gap-2.5 items-end min-w-0',
        isOwn ? 'flex-row-reverse' : 'flex-row',
        // Max width but auto-shrink to content
        'max-w-[85%] sm:max-w-[75%]'
      )}>
        {/* Avatar - only for received messages */}
        {!isOwn && showAvatar && (
          <BubbleAvatar sender={sender} />
        )}
        {/* Spacer for consecutive messages from same sender */}
        {!isOwn && !showAvatar && <div className="w-8 sm:w-9 flex-shrink-0" />}

        {/* Message content wrapper - auto width based on content */}
        <div ref={bubbleWrapperRef} className={cn('relative flex flex-col min-w-0 max-w-full', isOwn ? 'items-end' : 'items-start')}>
        {/* Reply preview - clickable to scroll to original message */}
        {repliedMessage && (
          <button
            onClick={() => onScrollToMessage?.(repliedMessage.id)}
            className={cn(
              "text-[10px] sm:text-[11px] px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-2xl mb-1.5 max-w-full text-left",
              "cursor-pointer hover:opacity-80 active:scale-[0.98] transition-all",
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
          </button>
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

        {/* Shared Theme - VYBE theme preview card */}
        {isSharedTheme && (
          <SharedThemeMessageBubble
            sharedThemeId={message.content || ''}
            isOwn={isOwn}
            senderUsername={sender?.username}
          />
        )}

        {/* Message bubble - Instagram-quality padding and radius (not for shared posts) */}
        {!isSharedPost && !isSharedTheme && (
        <div className="relative group/bubble">
          {/* Desktop-only 3-dot quick action menu (hidden on touch/mobile) */}
          <div className="hidden sm:block absolute -top-1 z-10" style={{ [isOwn ? 'left' : 'right']: '-28px' }}>
            <MessageActionMenu
              messageId={message.id}
              content={message.content}
              isOwn={isOwn}
              isTextMessage={!!message.content && !message.media_url}
              onReply={onReply}
              onEdit={onEdit}
              onUnsendForEveryone={onUnsendForEveryone}
              onDeleteForMe={onDeleteForMe}
            />
          </div>
        {(() => null)()}
        {/* Saved-state derived flags */}
        <div
          className={cn(
            'relative rounded-[20px] break-words overflow-hidden select-none max-w-full min-w-0 w-fit transition-all duration-200',
            isVybeMessage && 'bg-transparent p-0 shadow-none border-0',
            !isVybeMessage && isEmojiOnly 
              ? 'px-3 py-2'
              : !isVybeMessage && isMediaMessage
                ? 'p-1.5 sm:p-2'
                : !isVybeMessage && 'px-[14px] py-[10px] sm:px-4 sm:py-3',
            !isVybeMessage && isOwn 
              ? 'dm-bubble-sent rounded-br-md' 
              : !isVybeMessage && 'dm-bubble-received rounded-bl-md',
            !isVybeMessage && isOwn && message.view_mode === 'view_once' && 'ring-1 ring-accent/45',
            !isVybeMessage && isOwn && message.view_mode === '24h' && 'ring-1 ring-primary/35',
            repliedMessage && 'rounded-t-[14px]',
            (message.saved_by_sender || message.saved_by_recipient) &&
              'ring-2 ring-emerald-400/80 bg-emerald-500/15 shadow-[0_0_20px_-4px_rgba(52,211,153,0.55)]',
          )}
          data-message-id={message.id}
          onClick={(e) => {
            // Snapchat-style tap-to-save on 1:1 DMs.
            if (!onToggleSaved) return;
            if (isVybeMessage || isSharedPost || isSharedTheme) return;
            if (isContextMenuOpen) return;
            const target = e.target as HTMLElement;
            // Skip interactive children (play button, audio controls, viewer triggers)
            if (target.closest('button, a, input, textarea, [data-no-tap-save]')) return;
            try { (navigator as any)?.vibrate?.(8); } catch {}
            onToggleSaved();
          }}
          onContextMenu={handleContextMenu}
          onDoubleClick={onToggleReactions}
        >

          {/* Image/GIF message (not for shared posts - they use SharedPostBubble) */}
          {isMediaMessage && !isSharedPost && (
            <div onClick={handleMediaTap} className="cursor-pointer">
              <ChatMediaBubble
                mediaUrl={message.media_url!}
                mediaType={message.media_type as 'image' | 'gif'}
                isFlagged={(message as any).is_flagged}
                isOwn={isOwn}
                content={message.content}
              />
            </div>
          )}

          {/* Video message - regular DM video (not shared posts) */}
          {isVideoMessage && !isSharedPost && (
            <div onClick={handleMediaTap} className="cursor-pointer">
              <ChatMediaBubble
                mediaUrl={message.media_url!}
                mediaType="video"
                isFlagged={(message as any).is_flagged}
                isOwn={isOwn}
                content={message.content}
              />
            </div>
          )}

          {/* VYBE message - Snapchat style tap to view (view once) */}
          {isVybeMessage && (
            <div>
              {failed && isOwn ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-destructive/10 border border-destructive/25 text-destructive text-xs max-w-[min(100%,280px)]">
                  <Camera className="h-4 w-4 shrink-0" />
                  <span className="flex-1 leading-snug">
                    {(message as { _error?: string })._error || 'Could not send VYBE'}
                  </span>
                </div>
              ) : (
            <>
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
                      <VybeWordmark size="xs" className="opacity-60" />
                    </div>
                  </div>
                </motion.div>
              ) : vybeState === 'unopened' ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setIsReplaySession(false);
                    setShowVybeViewer(true);
                  }}
                  className={cn(
                    "relative w-36 h-48 sm:w-40 sm:h-52 rounded-[22px] overflow-hidden",
                    "flex flex-col items-center justify-center gap-3",
                    "shadow-lg shadow-primary/20 border border-primary/25",
                    "cursor-pointer",
                  )}
                  style={{
                    background: 'linear-gradient(145deg, hsl(var(--primary) / 0.92), hsl(var(--accent) / 0.88))',
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
                  <motion.div
                    className="absolute inset-0 opacity-40"
                    style={{
                      background:
                        'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                      backgroundSize: '200% 100%',
                    }}
                    animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
                    transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white">
                    <motion.div
                      className="p-3.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 shadow-inner"
                      animate={{ scale: [1, 1.06, 1] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Camera className="h-6 w-6" />
                    </motion.div>
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-semibold tracking-wide drop-shadow-sm">Tap to view</span>
                      <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-0.5 rounded-full bg-white/12 border border-white/20">
                        <Sparkles className="h-3 w-3" />
                        <span className="text-[10px] font-medium tracking-wider uppercase opacity-90">Vybe</span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ) : vybeState === 'replay_available' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "relative w-36 h-14 sm:w-40 sm:h-16 rounded-2xl overflow-hidden",
                    "bg-gradient-to-r from-muted/50 to-muted/30",
                    "border border-border/30",
                    "flex items-center justify-center gap-2 select-none touch-manipulation",
                  )}
                  onPointerDown={() => {
                    replayHoldRef.current = setTimeout(() => {
                      setIsReplaySession(true);
                      setShowVybeViewer(true);
                    }, 380);
                  }}
                  onPointerUp={() => {
                    if (replayHoldRef.current) {
                      clearTimeout(replayHoldRef.current);
                      replayHoldRef.current = null;
                    }
                  }}
                  onPointerLeave={() => {
                    if (replayHoldRef.current) {
                      clearTimeout(replayHoldRef.current);
                      replayHoldRef.current = null;
                    }
                  }}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="p-1.5 rounded-full bg-muted/50">
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Opened</span>
                      <span className="text-[10px] opacity-70">Hold to replay</span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={cn(
                    "relative w-36 h-14 sm:w-40 sm:h-16 rounded-2xl overflow-hidden",
                    "bg-gradient-to-r from-muted/50 to-muted/30",
                    "border border-border/30",
                    "flex items-center justify-center gap-2",
                  )}
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="p-1.5 rounded-full bg-muted/50">
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Opened</span>
                      <VybeWordmark size="xs" className="opacity-60" />
                    </div>
                  </div>
                </motion.div>
              )}
              
              {!isOwn && (
                <VybeViewer
                  mediaUrl={message.media_url || ''}
                  messageId={message.id}
                  senderId={message.sender_id}
                  conversationId={conversationId}
                  senderName={sender?.username}
                  senderAvatar={sender?.avatar_url}
                  isOpen={showVybeViewer}
                  isViewed={vybeState !== 'unopened'}
                  isReplaySession={isReplaySession}
                  isOwn={false}
                  onScreenshotDetected={onScreenshotCapture}
                  onClose={() => {
                    setShowVybeViewer(false);
                    if (isReplaySession) {
                      onVybeReplayExhausted?.();
                      setIsReplaySession(false);
                    }
                  }}
                  onReply={onReply}
                  onViewed={() => {
                    if (!isReplaySession && vybeState === 'unopened') {
                      onView();
                    }
                  }}
                  onSave={async () => {
                    try {
                      const { error } = await db
                        .from('messages')
                        .update({ media_type: 'image', viewed_at: new Date().toISOString() })
                        .eq('id', message.id);
                      if (error) throw error;
                      toast.success('VYBE saved to chat');
                    } catch {
                      toast.error('Failed to save VYBE');
                    }
                  }}
                />
              )}
            </>
              )}
            </div>
          )}

          {/* Voice notes */}
          {isAudioMessage && (
            <SignedAudioUrl mediaUrl={message.media_url!}>
              {(url) => url ? <AudioMessage src={url} isOwn={isOwn} /> : <Skeleton className="h-14 w-[220px] rounded-[22px]" />}
            </SignedAudioUrl>
          )}

          {message.view_mode === 'view_once' && !isOwn && isViewed ? (
            <p className="text-[13px] sm:text-sm italic opacity-75 leading-[1.4]">Message viewed</p>
          ) : !isVybeMessage && message.content ? (
            <p className={cn(
              "whitespace-pre-wrap leading-[1.4] break-words overflow-wrap-anywhere",
              isEmojiOnly 
                ? "text-2xl sm:text-3xl" // Larger font for emoji-only
                : "text-[14px] sm:text-[15px]" // Readable size
            )} style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{message.content?.startsWith('e2ee:') ? '🔒 Message from older version' : message.content}</p>
          ) : null}

        </div>
        </div>
        )}

        {/* Delivery + time meta */}
        {!isSharedPost && !isSharedTheme && !isEmojiOnly && (
          <div
            className={cn(
              'dm-bubble-meta flex items-center gap-1.5 mt-1 px-0.5',
              isOwn ? 'justify-end' : 'justify-start'
            )}
          >
            {isOwn && (
              <span className="opacity-70">
                {message.viewed_at ? 'Opened' : 'Delivered'}
              </span>
            )}
            <span className="opacity-50 tabular-nums">
              {format(new Date(message.created_at), 'h:mm a')}
            </span>
          </div>
        )}

        {isOwn && failed && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-[11px] text-destructive mt-1.5 hover:underline"
            aria-live="polite"
          >
            Not sent · Tap to retry
          </button>
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

        {/* Saved badge — subtle, animated, Snapchat-style */}
        <AnimatePresence>
          {(message.saved_by_sender || message.saved_by_recipient) && (
            <motion.div
              initial={{ scale: 0, rotate: -30, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              className={cn(
                'flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border',
                isOwn
                  ? 'self-end bg-primary/15 text-primary border-primary/30'
                  : 'self-start bg-cyan-400/15 text-cyan-400 border-cyan-400/30'
              )}
              title="Saved — tap message to unsave"
            >
              <Bookmark className="h-2.5 w-2.5 fill-current" />
              <span>Saved</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Timestamp and read receipts - 6-8px below bubble */}
        <div className={cn(
          "flex items-center gap-1.5 mt-2",
          isOwn ? "justify-end" : "justify-start"
        )}>
          <span className="text-[10px] text-muted-foreground/50 font-light">
            {format(new Date(message.created_at), 'HH:mm')}
          </span>
          {isOwn && (
            <SnapchatStatus
              status={resolveOwnMessageStatus(message, {
                peerLastReadAt: isGroupChat ? null : peerLastReadAt,
                failed,
                isGroupChat,
              })}
              animate={false}
            />
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
                "absolute bg-background border border-border rounded-full px-2 py-1.5 shadow-xl flex gap-0.5 z-50 max-w-[calc(100vw-16px)] overflow-x-auto no-scrollbar",
                reactionsFlipBelow ? "top-full mt-2" : "bottom-full mb-2",
                isOwn ? "right-0" : "left-0"
              )}
            >
              {smartEmojis.map((emoji) => (
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

        {/* Instagram-style dark context menu (shared component) */}
        <DMHoldMenu
          open={isContextMenuOpen}
          onClose={closeContextMenu}
          messageContent={message.content}
          mediaUrl={message.media_url}
          mediaType={message.media_type}
          isOwn={isOwn}
          userReaction={userReaction}
          onReaction={(emoji) => handleReaction(emoji)}
          onReply={onReply}
          onEdit={onEdit}
          onUnsend={isOwn ? handleUnsend : undefined}
          onDeleteForMe={() => {
            onDeleteForMe();
            closeContextMenu();
          }}
          onSave={(isMediaMessage || isVideoMessage) && message.media_url ? async () => {
            try {
              const { getSignedUrl, needsSigning } = await import('@/lib/signedUrlCache');
              const resolvedUrl = needsSigning(message.media_url!) ? await getSignedUrl(message.media_url!) : message.media_url!;
              const response = await fetch(resolvedUrl);
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `vybe-${Date.now()}.${message.media_type === 'video' ? 'mp4' : 'jpg'}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast.success('Saved to device');
            } catch {
              toast.error('Failed to save');
            }
          } : undefined}
          onSaveSticker={isMediaMessage && message.media_url && onSaveSticker ? () => onSaveSticker(message.media_url!) : undefined}
          onToggleKeep={onToggleSaved ? () => { onToggleSaved(); closeContextMenu(); } : undefined}
          isKept={!!(message.saved_by_sender || message.saved_by_recipient)}
        />

        {/* Fullscreen image/video viewer */}
        <AnimatePresence>
          {viewerMedia && (
            <ImageViewer
              mediaUrl={viewerMedia.url}
              mediaType={viewerMedia.type === 'gif' ? 'image' : viewerMedia.type}
              onClose={() => setViewerMedia(null)}
              onReply={() => { onReply(); setViewerMedia(null); }}
              onReaction={(emoji) => { onReaction(message.id, emoji); setViewerMedia(null); }}
              onDelete={isOwn ? () => { onUnsendForEveryone(); setViewerMedia(null); } : undefined}
              senderName={viewerMedia.senderName}
              timestamp={viewerMedia.timestamp}
              isOwn={isOwn}
            />
          )}
        </AnimatePresence>

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
    (prevProps.message as { _failed?: boolean })._failed === (nextProps.message as { _failed?: boolean })._failed &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.showReactions === nextProps.showReactions &&
    prevProps.profileId === nextProps.profileId &&
    prevProps.forceShowContextMenu === nextProps.forceShowContextMenu &&
    prevProps.message.saved_by_sender === nextProps.message.saved_by_sender &&
    prevProps.message.saved_by_recipient === nextProps.message.saved_by_recipient &&
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
