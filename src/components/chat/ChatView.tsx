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
import { useOlderMessages } from '@/hooks/useOlderMessages';
import { messagesQueryKey, readMessagesCache } from '@/lib/messagesQueryKey';
import { isSavedByViewer } from '@/lib/messageSaveToggle';
import {
  findCachedDmConversation,
  seedConversationDetailCache,
  seedMessagesFromInboxPreview,
} from '@/lib/warmDmConversation';
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
import { repairConversationForSend } from '@/lib/dmMembershipRepair';
import { getVybeRecipientState } from '@/lib/vybeViewState';
import { messageRowKey } from '@/lib/messagesQueryKey';
import { retryFailedItem } from '@/lib/dmOutbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { useBreakpoint } from '@/hooks/usePlatform';
import { useChatScreenShield } from '@/hooks/useChatScreenShield';
import { CHAT_SHIELD_ROOT_ID } from '@/lib/chatScreenShield';
import { requestDmThreadBack, setDmThreadBackHandler } from '@/lib/dmThreadBack';
import { dispatchDmCloseOverlays, DM_CLOSE_OVERLAYS_EVENT } from '@/lib/dmCloseOverlays';
import { attachDmNavClickDebug, logDmNavDebug } from '@/lib/dmNavDebug';
import { clearStaleViewportOverlays } from '@/lib/clearStaleViewportOverlays';
import { cancelStaleDmMessageQueries, retryDmThreadQueries } from '@/lib/retryDmThreadQueries';
import { dmThreadLog } from '@/lib/dmThreadDebug';
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
import { MessageReportDialog } from './MessageReportDialog';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { useSafetyReport } from '@/hooks/useSafetyReport';
import { readDmDraft, writeDmDraft } from '@/lib/dmDraftStorage';
import { DMHoldMenu } from './DMHoldMenu';
import { ReplyPreview } from './ReplyPreview';
import { StickerPanel } from './StickerPanel';
import { useAddSticker } from '@/hooks/useStickers';
import { 
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
  Bookmark,
} from 'lucide-react';
import { format } from 'date-fns';
import { Toybox } from './Toybox';
import { EmojiPicker } from './EmojiPicker';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlay } from '@/contexts/cameraOverlaySafe';
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
import { SharedPostPreviewProvider } from './SharedPostPreviews';
import { SharedThemeMessageBubble } from '@/components/messages/bubbles/SharedThemeMessageBubble';
import { formatMessageDate } from './chat-view/formatMessageDate';
import { ChatComposer as MessageInputArea } from './chat-view/ChatComposer';
import { ConversationWriteGate, isConversationWriteBlocked } from './chat-view/ConversationWriteGate';
import { ChatThreadShell } from './chat-view/ChatThreadShell';
import { groupMessages, spacingClassForItem } from './chat-view/groupMessages';
import { ChatSearchSheet } from './ChatSearchSheet';
import { CaptureAlertPopup } from './CaptureAlertPopup';
import { buildCaptureEventKey, mapLegacyCaptureType, severityForEventType } from '@/lib/ScreenshotDetectionService';
import type { CaptureAlertPayload } from '@/lib/ScreenshotDetectionService';
import { blendDmThemes, type DmThemeMode } from '@/lib/dmThemeBlend';
import { cn } from '@/lib/utils';
import { ensureArray, safeDmMembers } from '@/lib/persistedCollections';
import { saveElementScrollPosition, restoreElementScrollPosition } from '@/lib/scrollMemory';
import { normalizeMessagesCache, safeMessageViews, safeMessageReactions } from '@/lib/messagesQueryKey';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { DMSafetyGate } from './DMSafetyGate';
import { GroupInfoSheet } from './GroupInfoSheet';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { StreakIndicator } from './StreakIndicator';
import { useStreakWithUser } from '@/hooks/useStreaks';
import { useFriendshipStatus } from '@/hooks/useFriends';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
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
import { useVirtualScrollSlice } from '@/hooks/useVirtualScrollSlice';
import { CHAT_VIRTUAL_OVERSCAN, CHAT_VIRTUAL_THRESHOLD } from '@/lib/performanceConfig';
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
  const { user } = useAuth();
  const session = useReportAccountSession();
  const { conversationId } = useParams<{ conversationId: string }>();
  // Replies, editor text and open media panels belong to this one account/route.
  return <ChatViewContent key={JSON.stringify([user?.id, session.epoch, conversationId])} />;
}

function ChatViewContent() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile, user, authReady } = useAuth();
  const profileId = useAuthProfileId();
  const authUserId = profile?.user_id ?? user?.id;
  const queryClient = useQueryClient();
  const reportSession = useReportAccountSession();
  const assertMessageActionCurrent = useSafetyReport(conversationId || '').assertCurrent;
  const reportScope = JSON.stringify([user?.id, reportSession.epoch, conversationId]);
  const [reportedMessage, setReportedMessage] = useState<{ id: string; scope: string } | null>(null);
  useEffect(() => { setReportedMessage(null); }, [reportScope]);
  const bumpStreak = useInteractionStreakBump();
  const { isDesktop } = useBreakpoint();
  
  const { data: conversation, isPending: conversationPending, isFetched: conversationFetched, isError: conversationError, error: conversationFailure, refetch: refetchConversation } = useConversationDetail(conversationId);
  const cachedConversation = useMemo(
    () => (conversationId ? findCachedDmConversation(queryClient, conversationId, profileId) : undefined),
    [conversationId, profileId, queryClient, conversation],
  );
  const activeConversation = conversation ?? cachedConversation;
  const conversationWriteBlocked = isConversationWriteBlocked({ isError: conversationError, isFetched: conversationFetched, hasConversation: !!activeConversation, error: conversationFailure });
  const safeConversation = activeConversation ? { ...activeConversation, members: ensureArray(activeConversation.members) } : activeConversation;
  const isGroupChat = safeConversation?.is_group || false;
  const { data: messagesRaw, isPending: messagesPending, isFetched: messagesFetched, isError: messagesError, isFetching: messagesFetching, refetch: refetchMessages } = useMessages(conversationId);
  const messages = normalizeMessagesCache(messagesRaw);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [escapeEpoch, setEscapeEpoch] = useState(0);
  const actorReady = Boolean(profileId || profile?.id || authUserId);

  // Soft escape starts only after actor is known — never while profile resolve stalls.
  useEffect(() => {
    setLoadTimedOut(false);
    if (!conversationId || !actorReady) return;
    dmThreadLog('timeoutArmed', conversationId, { escapeEpoch });
    const t = window.setTimeout(() => {
      dmThreadLog('timeoutFired', conversationId);
      setLoadTimedOut(true);
    }, 8000);
    return () => {
      window.clearTimeout(t);
      dmThreadLog('timeoutCancelled', conversationId);
    };
  }, [conversationId, escapeEpoch, actorReady]);

  useEffect(() => {
    if (!conversationId) return;
    dmThreadLog('conversationClickAt', conversationId);
    cancelStaleDmMessageQueries(queryClient, conversationId);
  }, [conversationId, queryClient]);

  const {
    loadOlderMessages,
    isLoadingOlder,
    hasMoreOlder,
    resetOlderState,
  } = useOlderMessages(conversationId);
  const scrollHeightBeforeOlderRef = useRef(0);
  const threadMessages = useMemo(() => {
    if (!conversationId) return [] as Message[];
    const cached = readMessagesCache(queryClient, conversationId);
    const live = messages?.length ? messages : cached;
    const safeLive = ensureArray<Message>(live);
    if (!safeLive.length) return safeLive;
    return safeLive.filter((m) => !m.conversation_id || m.conversation_id === conversationId);
  }, [conversationId, messages, queryClient, messagesRaw]);
  const { sendText, sendMedia, sendVideo, retry: retryMessage, removeMessage, videoUploadProgress } = useInstantSend(conversationId);

  // Register current conversation for global realtime updates
  useEffect(() => {
    setCurrentConversationId(conversationId || null);
    return () => setCurrentConversationId(null);
  }, [conversationId]);

  // Seed thread preview from inbox / conversation header before network fetch completes.
  // Do not wait for profileId — warm/findCached already scans all inbox query keys.
  useEffect(() => {
    if (!conversationId) return;
    const seedActor = profileId ?? authUserId ?? null;
    seedConversationDetailCache(queryClient, conversationId, seedActor, activeConversation);
    if (activeConversation?.last_message?.id) {
      seedMessagesFromInboxPreview(queryClient, conversationId, seedActor, activeConversation);
    }
  }, [conversationId, profileId, authUserId, queryClient, activeConversation]);
  
  // Batch preload media URLs when idle — don't compete with first paint.
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const mediaUrls = messages
      .filter(m => m.message_type !== 'shared_post')
      .map(m => m.media_url)
      .filter((url): url is string => !!url && !url.startsWith('blob:') && !url.startsWith('data:'));
    if (mediaUrls.length === 0) return;

    const run = () => {
      import('@/lib/signedUrlCache').then(({ batchSignUrls }) => batchSignUrls(mediaUrls));
    };
    let idleId: number;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 2000 });
    } else {
      idleId = window.setTimeout(run, 600) as unknown as number;
    }
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
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
  
  // Screenshot shield on phone only — desktop web curtain can become an invisible trap.
  useChatScreenShield(!!conversationId && !isDesktop);

  // Clear stale full-viewport portals that outlive sheets/drawers.
  useEffect(() => {
    clearStaleViewportOverlays();
    const t = window.setTimeout(clearStaleViewportOverlays, 50);
    return () => window.clearTimeout(t);
  }, [conversationId]);

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
  
  const { settings, partnerSettings } = useDMSettings(conversationId);
  const blendedTheme = useMemo(() => {
    const mode = (settings.theme_mode as DmThemeMode) || 'default';
    const mine = {
      primary: '262 83% 58%',
      secondary: '280 60% 45%',
      accent: '320 70% 55%',
      background: '0 0% 7%',
    };
    const theirs = {
      primary: '200 80% 50%',
      secondary: '210 40% 40%',
      accent: '190 70% 45%',
      background: '0 0% 7%',
    };
    return blendDmThemes(mine, theirs, mode);
  }, [settings.theme_mode]);
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

  // Restore only this account's tab-local draft, before painting the composer.
  useLayoutEffect(() => {
    const saved = readDmDraft(conversationId, reportSession);
    messageTextRef.current = saved;
    if (inputRef.current) inputRef.current.value = saved;
    setHasText(saved.length > 0);
  }, [conversationId, reportSession]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('vybe-dm-view-mode');
      const allowed: ViewMode[] = [
        'permanent',
        '24h',
        'view_once',
        'on_close',
        'replay_once',
        'keep',
        'timed',
      ];
      if (saved && (allowed as string[]).includes(saved)) {
        return saved as ViewMode;
      }
    } catch { /* ignore */ }
    return '24h';
  });

  useEffect(() => {
    try {
      localStorage.setItem('vybe-dm-view-mode', viewMode);
    } catch { /* ignore */ }
  }, [viewMode]);

  const captureAlerts = useMemo((): CaptureAlertPayload[] => {
    return screenshotEvents.map((evt) => {
      const ts = new Date(evt.timestamp).getTime();
      const eventType = mapLegacyCaptureType(isRecording ? 'screen_record' : 'screenshot', {
        isDisappearingMedia: viewMode === 'view_once' || viewMode === 'replay_once',
      });
      return {
        eventType,
        severity: severityForEventType(eventType),
        conversationId,
        capturedByDisplayName: evt.username,
        timestamp: ts,
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'web',
        confidence: 'medium' as const,
      };
    });
  }, [screenshotEvents, conversationId, isRecording, viewMode]);

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
  const [showChatSearch, setShowChatSearch] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showMediaSettings, setShowMediaSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [cameraFirstMode, setCameraFirstMode] = useState(false);

  const callStore = useCallStore();
  const { openCamera, isOpen: isCameraOpen, closeCamera } = useCameraOverlay();
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
  const prevLastMessageIdRef = useRef<string | null>(null);
  const openedConversationRef = useRef<string | null>(null);
  const prevThreadLenRef = useRef(0);
  const messageNotifsClearedForConversationRef = useRef<string | null>(null);

  // Reset ephemeral UI when switching threads — avoids stale reply/edit/recording state.
  useEffect(() => {
    if (!conversationId) return;
    setReplyingTo(null);
    setActiveReactionMessageId(null);
    setShowContextMenuMessageId(null);
    setEditingMessageId(null);
    setEditText('');
    setIsRecordingVoice(false);
    setIsVoiceLocked(false);
    setShowViewModeMenu(false);
    setShowStickerPanel(false);
    setShowVideoPreview(false);
    setPendingVideoFile(null);
    setPendingImage(null);
    setShowImageSafetyGate(false);
    setPendingSafetyImage(null);
    setCameraFirstMode(false);
    setShowChatSearch(false);
    setShowVanishThreads(false);
    setShowMemoryPins(false);
    setShowScheduleMessage(false);
    setShowDMSettings(false);
    setShowGroupInfo(false);
    setShowMediaSettings(false);
    setShowAdminPanel(false);
    setShowOfferDialog(false);
    setShowScreenshotAlert(false);
    dispatchDmCloseOverlays();
    clearStaleViewportOverlays();
    clearSuggestions();
    resetOlderState();
  }, [conversationId, clearSuggestions, resetOlderState]);

  // Priority back: close viewers/sheets/camera before leaving the thread.
  useEffect(() => {
    const handler = (): boolean => {
      const sheetOpen =
        showChatSearch ||
        showVanishThreads ||
        showMemoryPins ||
        showScheduleMessage ||
        showDMSettings ||
        showGroupInfo ||
        showMediaSettings ||
        showAdminPanel ||
        showOfferDialog ||
        showVideoPreview ||
        showImageSafetyGate ||
        showStickerPanel;
      const cameraOpen = cameraFirstMode || isCameraOpen;
      const menuOpen =
        Boolean(activeReactionMessageId) ||
        Boolean(showContextMenuMessageId) ||
        showViewModeMenu;
      // Snapshot before close so a empty dispatch cannot eat a leave tap.
      const hadMedia = dispatchDmCloseOverlays();
      if (hadMedia) {
        logDmNavDebug('back-closed-media');
        return true;
      }
      if (sheetOpen) {
        setShowChatSearch(false);
        setShowVanishThreads(false);
        setShowMemoryPins(false);
        setShowScheduleMessage(false);
        setShowDMSettings(false);
        setShowGroupInfo(false);
        setShowMediaSettings(false);
        setShowAdminPanel(false);
        setShowOfferDialog(false);
        setShowVideoPreview(false);
        setPendingVideoFile(null);
        setShowImageSafetyGate(false);
        setPendingSafetyImage(null);
        setShowStickerPanel(false);
        logDmNavDebug('back-closed-sheet');
        return true;
      }
      if (cameraOpen) {
        setCameraFirstMode(false);
        if (isCameraOpen) closeCamera();
        logDmNavDebug('back-closed-camera');
        return true;
      }
      if (menuOpen) {
        setActiveReactionMessageId(null);
        setShowContextMenuMessageId(null);
        setShowViewModeMenu(false);
        logDmNavDebug('back-closed-menu');
        return true;
      }
      return false;
    };
    setDmThreadBackHandler(handler);
    return () => setDmThreadBackHandler(null);
  }, [
    showChatSearch,
    showVanishThreads,
    showMemoryPins,
    showScheduleMessage,
    showDMSettings,
    showGroupInfo,
    showMediaSettings,
    showAdminPanel,
    showOfferDialog,
    showVideoPreview,
    showImageSafetyGate,
    showStickerPanel,
    cameraFirstMode,
    isCameraOpen,
    activeReactionMessageId,
    showContextMenuMessageId,
    showViewModeMenu,
    closeCamera,
  ]);

  useEffect(() => attachDmNavClickDebug(), []);


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

  // Live status only from Firestore presence heartbeat — never PG/user_presence fallback
  // (stale rows show "online" when the peer has no FS doc).
  const otherMemberOnline = Boolean(peerPresence?.is_online);

  // Get streak with the other user (for DMs)
  const streak = useStreakWithUser(!isGroupChat ? otherMember?.id : undefined);
  const { data: dmFriendship } = useFriendshipStatus(!isGroupChat ? otherMember?.id : undefined);
  
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
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 2500 });
    } else {
      idleId = window.setTimeout(run, 800) as unknown as number;
    }

    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
      else clearTimeout(idleId);
    };
  }, [conversationId, profileId, queryClient, otherMembers]);

  // Batch-mark messages as read after paint — avoids N mutations + cache thrash on open.
  const flushMessageViews = useCallback(async (messageIds: string[]) => {
    if (!conversationId || !profile?.id || profile.user_id !== user?.id || messageIds.length === 0) return;
    try { assertMessageActionCurrent(); } catch { return; }
    const capturedSession = reportSession;

    const realIds = messageIds.filter((id) => typeof id === 'string' && !id.startsWith('temp-'));
    if (realIds.length === 0) return;

    const viewedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const idSet = new Set(realIds);

    try {
      const { error: viewsError } = await db.from('message_views').upsert(
        realIds.map((message_id) => ({ message_id, user_id: profile.id })),
        { onConflict: 'message_id,user_id', ignoreDuplicates: true },
      );
      assertMessageActionCurrent();
      if (viewsError) return;

      const { data: expiryCandidates } = await db
        .from('messages')
        .select('id, view_mode, saved_by_sender, saved_by_recipient, expires_at')
        .in('id', realIds);
      assertMessageActionCurrent();

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
        assertMessageActionCurrent();
      }
    } catch (err) {
      try { assertMessageActionCurrent(); } catch { return; }
      if (import.meta.env.DEV) console.warn('[ChatView] batch mark viewed failed:', err);
      return;
    }

    try { assertMessageActionCurrent(); } catch { return; }
    queryClient.setQueryData<Message[]>(messagesQueryKey(conversationId, capturedSession), (old) => {
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
  }, [profile?.id, profile?.user_id, user?.id, queryClient, conversationId, assertMessageActionCurrent, reportSession]);

  // Auto-mark messages as read (EXCEPT VYBEs which require explicit tap-to-view)
  useEffect(() => {
    if (!messages || !profileId || !conversationId) return;

    const unreadIds: string[] = [];
    for (const msg of messages) {
      if (typeof msg.id === 'string' && msg.id.startsWith('temp-')) continue;
      // Skip when sender is this profile OR auth uid (dual-id self).
      if (
        msg.sender_id === profileId ||
        msg.sender_id === profile?.id ||
        msg.sender_id === authUserId
      ) {
        continue;
      }
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
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 1200 });
    } else {
      idleId = window.setTimeout(run, 400) as unknown as number;
    }

    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [messages, profileId, profile?.id, authUserId, conversationId, flushMessageViews]);

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

  // Scroll to bottom on open / append at bottom — not when older messages prepend.
  const lastThreadMessage = threadMessages[threadMessages.length - 1];
  const lastThreadMessageId = lastThreadMessage?.id ?? null;
  const lastThreadMessageIsOwn =
    !!lastThreadMessage &&
    (lastThreadMessage.sender_id === profileId || lastThreadMessage.sender_id === profile?.id);
  useLayoutEffect(() => {
    if (!conversationId) return;

    const savedKey = `chat-${conversationId}`;
    const isNewConversation = openedConversationRef.current !== conversationId;
    if (isNewConversation) {
      openedConversationRef.current = conversationId;
      prevLastMessageIdRef.current = null;
      prevThreadLenRef.current = 0;
    }

    const container = messagesContainerRef.current;
    if (!container) return;

    const prevLastId = prevLastMessageIdRef.current;
    const prevLen = prevThreadLenRef.current;
    const nextLen = threadMessages.length;

    let fromInbox = false;
    try {
      fromInbox = sessionStorage.getItem('vybe-dm-from-inbox') === conversationId;
      if (fromInbox) sessionStorage.removeItem('vybe-dm-from-inbox');
    } catch {
      /* ignore */
    }

    if (isNewConversation) {
      // Inbox → chat always lands on latest; clip/modal return may restore.
      if (!fromInbox && restoreElementScrollPosition(savedKey, container)) {
        prevLastMessageIdRef.current = lastThreadMessageId;
        prevThreadLenRef.current = nextLen;
        return;
      }
      container.scrollTop = container.scrollHeight;
    } else if (prevLen > 0 && prevLen <= 2 && nextLen > prevLen && lastThreadMessageId === prevLastId) {
      // Full history replaced inbox seed — re-pin bottom even if last id unchanged.
      container.scrollTop = container.scrollHeight;
    } else if (lastThreadMessageId && lastThreadMessageId !== prevLastId) {
      // New message at the bottom: follow it if it's ours or we're already near
      // the bottom. Don't yank the user out of scrolled-up history.
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (lastThreadMessageIsOwn || distanceFromBottom < 240) {
        container.scrollTop = container.scrollHeight;
      }
    }
    prevLastMessageIdRef.current = lastThreadMessageId;
    prevThreadLenRef.current = nextLen;
  }, [conversationId, lastThreadMessageId, lastThreadMessageIsOwn, threadMessages.length]);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container || !hasMoreOlder || isLoadingOlder) return;
    // Start loading well before the top so scrolling up never hits a wall.
    if (container.scrollTop > 600) return;

    scrollHeightBeforeOlderRef.current = container.scrollHeight;
    void loadOlderMessages().then(() => {
      requestAnimationFrame(() => {
        const scroller = messagesContainerRef.current;
        if (!scroller) return;
        const delta = scroller.scrollHeight - scrollHeightBeforeOlderRef.current;
        if (delta > 0) scroller.scrollTop += delta;
      });
    });
  }, [hasMoreOlder, isLoadingOlder, loadOlderMessages]);

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
    try { assertMessageActionCurrent(); } catch { return; }
    // Update ref IMMEDIATELY (no re-render).
    messageTextRef.current = value;

    // Only flip parent state when the empty boundary changes — this is
    // what gates the send button vs. the sticker/voice cluster.
    const nowHas = value.length > 0;
    setHasText(prev => prev === nowHas ? prev : nowHas);

    writeDmDraft(conversationId, value, reportSession);

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
  }, [setTyping, conversationId, reportSession, assertMessageActionCurrent]);

  // Append helper used by emoji pickers (still needs to update the DOM input).
  const appendToInput = useCallback((appended: string) => {
    const next = (messageTextRef.current || '') + appended;
    writeInputDom(next);
    handleInputChange(next);
  }, [writeInputDom, handleInputChange]);

  const handleSend = useCallback(() => {
    if (conversationWriteBlocked) return;
    try { assertMessageActionCurrent(); } catch { return; }
    const raw = messageTextRef.current;
    if (!raw.trim() || !conversationId) return;

    // Clear draft on send
    writeDmDraft(conversationId, '', reportSession);

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
      assertMessageActionCurrent();
      if (!isGroupChat && otherMember?.id) {
        bumpStreak(otherMember.id);
      }
    }).catch(() => {
      try { assertMessageActionCurrent(); } catch { return; }
      messageTextRef.current = text;
      writeDmDraft(conversationId, text, reportSession);
      writeInputDom(text);
      setHasText(true);
    });
  }, [conversationId, viewMode, replyingTo, setTyping, sendText, editingMessageId, editMessage, isGroupChat, otherMember?.id, bumpStreak, writeInputDom, conversationWriteBlocked, assertMessageActionCurrent, reportSession]);


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
    assertMessageActionCurrent();
    if (conversationWriteBlocked) throw new Error('Sending is unavailable for this conversation.');

    try {
      await sendMedia(mediaUrl, mediaType, viewMode, replyingTo?.id);
      assertMessageActionCurrent();
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to send media:', error);
      throw error;
    }
  }, [conversationId, profileId, viewMode, replyingTo?.id, sendMedia, conversationWriteBlocked, assertMessageActionCurrent]);

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


  const handleOpenSnapCamera = useCallback(() => {
    if (conversationWriteBlocked) return;
    try { assertMessageActionCurrent(); } catch { return; }
    if (callStore.state.phase !== 'idle') {
      toast.error('End your call to use the camera');
      return;
    }
    // Snap flow: conversation preselected, capture → edit → direct send with
    // recipient chip; background upload/send returns straight to this chat.
    if (!conversationId) {
      openSnapCamera(openCamera, { source: 'global', defaultDestination: 'direct' });
      return;
    }
    openSnapCamera(openCamera, {
      source: 'conversation',
      conversationId,
      recipientIds: otherMember?.id ? [otherMember.id] : undefined,
      returnRoute: `/messages/${conversationId}`,
      replyToMessageId: replyingTo?.id,
      replyConversationId: conversationId,
    });
  }, [callStore.state.phase, openCamera, conversationId, otherMember?.id, replyingTo?.id, conversationWriteBlocked, assertMessageActionCurrent]);

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

  // Group consecutive messages by sender — avatar/timestamp collapsing +
  // Instagram/iMessage spacing rules live in ./chat-view/groupMessages.ts.
  const messageItems = useMemo(() => {
    return groupMessages(threadMessages, (message) =>
      message.sender_id === profileId ||
      message.sender_id === profile?.id ||
      message.sender_id === authUserId,
    );
  }, [threadMessages, profileId, profile?.id, authUserId]);

  type MessageItemRow = (typeof messageItems)[number];

  const estimateMessageHeight = useCallback((item: MessageItemRow) => {
    const { message, showTimestamp, isEmojiOnly } = item;
    const isMedia =
      !!message.media_url &&
      (message.media_type === 'image' ||
        message.media_type === 'gif' ||
        message.media_type === 'video');
    const isCallEvent = message.message_type === 'call_event';
    const isCapture =
      message.message_type === 'screenshot_notification' ||
      message.message_type === 'screen_recording_notification';

    let h = 10;
    if (showTimestamp) h += 48;
    if (isCallEvent || isCapture) h += 44;
    else if (isMedia) h += 260;
    else if (message.media_type === 'audio') h += 72;
    else if (isEmojiOnly) h += 44;
    else {
      const len = typeof message.content === 'string' ? message.content.length : 0;
      h += Math.min(160, 36 + Math.ceil(len / 36) * 20);
    }
    return h;
  }, []);

  const {
    visible: visibleMessageItems,
    visibleStart: visibleMessageStart,
    paddingTop: messagesPaddingTop,
    paddingBottom: messagesPaddingBottom,
    virtualized: messagesVirtualized,
  } = useVirtualScrollSlice(messageItems, {
    threshold: CHAT_VIRTUAL_THRESHOLD,
    estimateHeight: estimateMessageHeight,
    overscan: CHAT_VIRTUAL_OVERSCAN,
    scrollRef: messagesContainerRef,
  });
  const renderedMessageItems = messagesVirtualized ? visibleMessageItems : messageItems;

  // Navigate to profile when avatar clicked, or open group info for group chats
  const handleAvatarClick = useCallback(() => {
    if (isGroupChat) {
      setShowGroupInfo(true);
    } else if (otherMember?.username) {
      openFriendProfile(navigate, {
        username: otherMember.username,
        friendshipStatus: dmFriendship?.status ?? 'friends',
      });
    }
  }, [isGroupChat, otherMember?.username, dmFriendship?.status, navigate]);

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

  const cachedMessagesLenEarly = conversationId ? readMessagesCache(queryClient, conversationId).length : 0;
  const hasThreadContentEarly =
    threadMessages.length > 0 || cachedMessagesLenEarly > 0;

  useEffect(() => {
    if (hasThreadContentEarly) {
      setLoadTimedOut(false);
      dmThreadLog('firstCachedMessageRenderedAt', conversationId, {
        count: threadMessages.length || cachedMessagesLenEarly,
      });
    }
  }, [hasThreadContentEarly, conversationId, threadMessages.length, cachedMessagesLenEarly]);

  const stillWaitingOnThread =
    !!conversationId &&
    !hasThreadContentEarly &&
    actorReady &&
    (messagesPending ||
      messagesFetching ||
      (!activeConversation &&
        conversationPending &&
        !conversationFetched &&
        !cachedConversation));

  const showTimeoutBanner = loadTimedOut && stillWaitingOnThread;
  const showOpeningBanner =
    !!conversationId &&
    authReady &&
    !profileId &&
    !profile?.id &&
    !cachedConversation &&
    !hasThreadContentEarly &&
    !messagesFetching &&
    messagesPending &&
    !showTimeoutBanner;
  const showMessagesErrorBanner =
    messagesFetched &&
    messagesError &&
    !messagesFetching &&
    !hasThreadContentEarly &&
    !!conversationId &&
    !showTimeoutBanner;
  const showConversationErrorBanner =
    conversationFetched &&
    conversationError &&
    !activeConversation &&
    !!conversationId &&
    !showTimeoutBanner;

  const cachedMessagesLen = cachedMessagesLenEarly;
  const hasThreadContent = hasThreadContentEarly;
  const showConversationSkeleton =
    !!conversationId &&
    !activeConversation &&
    !hasThreadContent &&
    conversationPending &&
    !conversationFetched &&
    !cachedConversation &&
    !showTimeoutBanner;
  const showMessagesSkeleton =
    !!conversationId &&
    !hasThreadContent &&
    messagesPending &&
    !messagesFetched &&
    !loadTimedOut;
  const isChatHydrating = showConversationSkeleton || showMessagesSkeleton;

  const messagesLoadFailed =
    !!activeConversation &&
    messagesFetched &&
    messagesError &&
    !messagesFetching &&
    !threadMessages.length;

  // Never disable the input for message fetch/refetch — only wait for actor identity.
  // Gating on messagesFetching made empty/transitioning threads feel broken.
  const composerConnecting = Boolean(conversationId) && !actorReady;

  const handleThreadRetry = useCallback(() => {
    setEscapeEpoch((n) => n + 1);
    retryDmThreadQueries(queryClient, conversationId);
  }, [queryClient, conversationId]);

  // Per-conversation theme vars consumed by index.css — wallpaper always
  // applies; bubble color overrides only when the viewer picked a non-default
  // theme mode, so the default gradient bubbles (index.css) stay untouched.
  const chatThreadStyle: React.CSSProperties = {
    ...(blendedTheme.wallpaper ? { ['--dm-chat-wallpaper' as string]: blendedTheme.wallpaper } : {}),
    ...(blendedTheme.mode !== 'default'
      ? {
          ['--dm-bubble-sent' as string]: blendedTheme.bubbleMine,
          ['--dm-bubble-received' as string]: blendedTheme.bubbleTheirs,
          ['--dm-bubble-sent-fg' as string]: blendedTheme.textOnMine,
          ['--dm-bubble-received-fg' as string]: blendedTheme.textOnTheirs,
        }
      : {}),
  };

  const profileSlot = (
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
            {safeConversation?.avatar_url ? (
              <SignedAvatar
                src={safeConversation.avatar_url}
                fallback="G"
                className="h-full w-full"
                fallbackClassName="text-sm bg-muted text-foreground"
              />
            ) : (
              <Avatar className="h-full w-full">
                <AvatarFallback className="text-sm bg-muted text-foreground">
                  <Users className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-background">
            {otherMembers.length + 1}
          </div>
        </div>
      ) : (
        <ChatHeaderPresenceAvatar
          avatarUrl={otherMember?.avatar_url ?? peerPresence?.avatar_url}
          fallbackAvatarUrl={otherMember?.avatar_url}
          username={otherMember?.username || otherMember?.display_name || ''}
          activity={showPeerPresence ? otherPresenceActivity : 'idle'}
          isOnline={otherMemberOnline}
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
              isOnline={otherMemberOnline}
              isTyping={otherPresenceActivity === 'typing'}
              isInChat={otherMemberOnline && otherPresenceActivity === 'viewing'}
              isInCamera={
                otherMemberOnline &&
                (otherPresenceActivity === 'taking_photo' ||
                  otherPresenceActivity === 'recording_video' ||
                  otherPresenceActivity === 'sending_vybe')
              }
              activity={otherPresenceActivity}
              username={otherMember?.username}
              lastReadAt={lastReadAt}
            />
          </p>
        )}
      </div>
    </button>
  );

  const actionsSlot = (
    <>
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
    </>
  );

  return (
    <SharedPostPreviewProvider conversationId={conversationId || ''}>
    <ChatThreadShell
      shellId={CHAT_SHIELD_ROOT_ID}
      className="dm-thread"
      themeStyle={chatThreadStyle}
      onBack={() => {
        logDmNavDebug('header-back');
        requestDmThreadBack(navigate);
      }}
      onOpenSearch={() => setShowChatSearch(true)}
      profileSlot={profileSlot}
      actionsSlot={actionsSlot}
      viewMode={viewMode}
      isGroupChat={isGroupChat}
      onViewModeChange={setViewMode}
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

      {/* Capture alert popup */}
      <CaptureAlertPopup alerts={captureAlerts} />

      <ChatSearchSheet
        open={showChatSearch}
        onOpenChange={setShowChatSearch}
        conversationId={conversationId}
      />

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
          "dm-chat-messages vybe-chat-messages scroller flex-1 overflow-y-auto overflow-x-hidden min-h-0",
          "px-3 sm:px-4 pb-3",
          getWallpaperClass()
        )}
        data-no-auto-contrast
        style={{ 
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        onScroll={handleMessagesScroll}
      >
        {showTimeoutBanner && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-3 text-center pointer-events-auto">
            <p className="text-xs text-muted-foreground mb-2">This chat is taking too long to load.</p>
            <Button size="sm" variant="secondary" onClick={handleThreadRetry}>
              Try again
            </Button>
          </div>
        )}
        {showOpeningBanner && (
          <div className="mb-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground">Opening chat…</p>
          </div>
        )}
        {showMessagesErrorBanner && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center pointer-events-auto">
            <p className="text-xs text-muted-foreground mb-2">Couldn&apos;t load this conversation.</p>
            <Button size="sm" variant="secondary" onClick={handleThreadRetry}>
              Try again
            </Button>
          </div>
        )}
        {showConversationErrorBanner && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center pointer-events-auto">
            <p className="text-xs text-muted-foreground mb-2">Couldn&apos;t load this chat.</p>
            <Button size="sm" variant="secondary" onClick={() => void refetchConversation()}>
              Try again
            </Button>
          </div>
        )}
        {messagesLoadFailed && (
          <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-center pointer-events-auto">
            <p className="text-xs text-muted-foreground mb-2">Couldn&apos;t load messages.</p>
            <Button size="sm" variant="secondary" onClick={handleThreadRetry}>
              Try again
            </Button>
          </div>
        )}
        {isChatHydrating ? (
          <div className="flex flex-col gap-3 py-2 pointer-events-none" aria-busy="true">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <Skeleton className="h-11 w-44 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
        <div key={conversationId} className="flex flex-col gap-0 pb-4 md:pb-4">
          {isLoadingOlder && threadMessages.length > 0 && (
            <div className="py-2 text-center">
              <span className="text-[11px] text-muted-foreground">Loading earlier messages…</span>
            </div>
          )}
          {messagesVirtualized && messagesPaddingTop > 0 && (
            <div aria-hidden style={{ height: messagesPaddingTop }} />
          )}
          {renderedMessageItems.map((item, localIndex) => {
            const index = messagesVirtualized ? visibleMessageStart + localIndex : localIndex;
            const { message, isOwn, showAvatar, showTimestamp, isEmojiOnly } = item;
            // Instagram/Snapchat spacing rules — see spacingClassForItem in
            // ./chat-view/groupMessages.ts (same-sender tight, sender switch
            // or media transition airy, after-reply medium).
            const prevItem = index > 0 ? messageItems[index - 1] : null;
            const spacingClass = spacingClassForItem(item, prevItem);
            
            // Check if this is a screenshot or screen recording notification system message
            const isScreenshotNotification = message.message_type === 'screenshot_notification';
            const isRecordingNotification = message.message_type === 'screen_recording_notification';
            const isCallEvent = message.message_type === 'call_event';
            const isCaptureNotification = isScreenshotNotification || isRecordingNotification;

            const wrapMessageRow = (row: ReactNode) => (
              <LocalErrorBoundary key={messageRowKey(message)} label="chat-message">
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
                {/* Swipe = reply, hold = menu, clean tap on bubble = Snapchat save toggle */}
                <SwipeToReply
                  onReply={() => handleReply(message)}
                  onLongPress={() => setShowContextMenuMessageId(message.id)}
                  onTap={
                    !isGroupChat && !message.id.startsWith('temp-')
                      ? (target) => {
                          if (showContextMenuMessageId) return;
                          if (target.closest('button, a, input, textarea, [data-no-tap-save]')) return;
                          if (!target.closest('[data-tap-save]')) return;
                          try { navigator.vibrate?.(8); } catch { /* unsupported */ }
                          toggleSaved.mutate(message.id);
                        }
                      : undefined
                  }
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
                    onReport={!isOwn ? () => setReportedMessage({ id: message.id, scope: reportScope }) : undefined}
                    reportScope={reportScope}
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
                    authUserId={authUserId}
                    isEmojiOnly={isEmojiOnly}
                    onNavigateToPost={(postId) => navigate(`/clips/${postId}`, { state: { from: 'messages', conversationId } })}
                    onScrollToMessage={scrollToMessage}
                    forceShowContextMenu={showContextMenuMessageId === message.id}
                    onCloseContextMenu={() => setShowContextMenuMessageId(null)}
                    onToggleSaved={!isGroupChat ? () => toggleSaved.mutate(message.id) : undefined}
                    onRetry={
                      isOwn && (message as { _failed?: boolean })._failed
                        ? () => {
                            // Outbox items (queued while offline) resend from the
                            // stored payload even if this ChatView remounted;
                            // fall back to the in-memory retry for same-session failures.
                            try { assertMessageActionCurrent(); } catch { return; }
                            void retryFailedItem(message.id, reportSession).then((handled) => {
                              assertMessageActionCurrent();
                              if (!handled) retryMessage(message.id);
                            }).catch(() => { /* The outbox owns retry errors; old account callbacks stop here. */ });
                          }
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

          {messagesVirtualized && messagesPaddingBottom > 0 && (
            <div aria-hidden style={{ height: messagesPaddingBottom }} />
          )}

          <div ref={messagesEndRef} className="h-1" />
        </div>
        )}
      </div>


      {/* Camera-First Overlay */}
      <CameraFirstOverlay
        isOpen={cameraFirstMode && !conversationWriteBlocked}
        recipientName={displayName}
        recipientAvatar={otherMember?.avatar_url || undefined}
        onClose={() => setCameraFirstMode(false)}
        onSend={() => {
          setCameraFirstMode(false);
          handleOpenSnapCamera();
        }}
        onOpenChat={() => setCameraFirstMode(false)}
      />

      {/* VYBE Camera Modal — only mount when open to avoid heavy AR/MediaPipe init in DM view */}
      {/* Video Send Preview Modal */}
      <VideoSendPreview
        open={showVideoPreview && !conversationWriteBlocked}
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
      <ConversationWriteGate blocked={conversationWriteBlocked}>
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
            isPending={composerConnecting}
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
            messagesEndRef={messagesEndRef}
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
          isPending={composerConnecting}
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
          messagesEndRef={messagesEndRef}
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
      </ConversationWriteGate>

      {conversationId && reportedMessage?.scope === reportScope && <MessageReportDialog
        key={`${reportScope}:${reportedMessage.id}`}
        messageId={reportedMessage.id}
        conversationId={conversationId}
        onClose={() => setReportedMessage(current => current?.scope === reportScope && current.id === reportedMessage.id ? null : current)}
      />}

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
    </ChatThreadShell>
    </SharedPostPreviewProvider>
  );
}

// MessageInputArea lives in ./chat-view/ChatComposer.tsx (imported as MessageInputArea)

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
  onReport,
  onEdit,
  allMessages,
  themeColor = { bubble: 'bg-primary', text: 'text-primary-foreground' },
  showReactions,
  onToggleReactions,
  profileId,
  authUserId,
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
  onReport?: () => void;
  reportScope?: string;
  onEdit?: () => void;
  onSaveSticker?: (url: string) => void;
  allMessages?: Message[];
  themeColor?: { bubble: string; text: string };
  showReactions: boolean;
  onToggleReactions: () => void;
  profileId?: string;
  authUserId?: string | null;
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

  useEffect(() => {
    const onCloseOverlays = (e: Event) => {
      const detail = (e as CustomEvent<{ closed: boolean }>).detail;
      let closed = false;
      if (viewerMedia) {
        setViewerMedia(null);
        closed = true;
      }
      if (showVybeViewer) {
        setShowVybeViewer(false);
        closed = true;
      }
      if (showContextMenu) {
        setShowContextMenu(false);
        closed = true;
      }
      if (closed && detail) detail.closed = true;
    };
    window.addEventListener(DM_CLOSE_OVERLAYS_EVENT, onCloseOverlays);
    return () => window.removeEventListener(DM_CLOSE_OVERLAYS_EVENT, onCloseOverlays);
  }, [viewerMedia, showVybeViewer, showContextMenu]);

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
    // Auto-view only for view-once *media* — never plain text (false "Message viewed").
    const mediaType = String(message.media_type || '').toLowerCase();
    const isPlainText =
      !message.media_url &&
      (mediaType === '' || mediaType === 'text' || mediaType === 'none');
    const isViewOnceMedia =
      message.view_mode === 'view_once' &&
      !isPlainText &&
      mediaType !== 'vybe' &&
      (Boolean(message.media_url) ||
        ['image', 'photo', 'video', 'audio', 'voice', 'gif'].includes(mediaType));

    if (!isOwn && isViewOnceMedia && !isViewed) {
      onView();
      setIsViewed(true);
    }
  }, [
    isOwn,
    message.view_mode,
    message.media_type,
    message.media_url,
    isViewed,
    onView,
  ]);

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

  const handleMediaTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isContextMenuOpen || message.message_type === 'shared_post') return;
    if (message.media_url && (message.media_type === 'image' || message.media_type === 'gif' || message.media_type === 'video')) {
      setViewerMedia({
        url: message.media_url,
        type: message.media_type as 'image' | 'gif' | 'video',
        senderName: isOwn ? 'You' : (sender?.username || undefined),
        timestamp: message.created_at,
      });
    }
  }, [isContextMenuOpen, message.message_type, message.media_url, message.media_type, message.created_at, isOwn, sender?.username]);

  // Check if this is an audio message for proper sizing
  const isAudioMessage = message.media_url && message.media_type === 'audio';
  const isMediaMessage = message.media_url && (message.media_type === 'image' || message.media_type === 'gif');
  const isVideoMessage = message.media_url && message.media_type === 'video';
  const isVybeMessage = message.media_type === 'vybe';
  const isSharedPost = message.message_type === 'shared_post';
  const isSharedTheme = message.message_type === 'shared_theme';
  const mySaved = profileId
    ? isSavedByViewer(message, profileId, authUserId)
    : false;

  return (
    <div 
      id={`message-${message.id}`}
      onContextMenu={handleContextMenu}
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
              onReport={onReport}
            />
          </div>
        {(() => null)()}
        {/* Saved-state derived flags */}
        <div
          className={cn(
            'relative rounded-[20px] break-words overflow-hidden select-none max-w-full min-w-0 w-fit transition-[border-color,box-shadow,background-color] duration-200',
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
            mySaved &&
              'ring-2 ring-emerald-400/80 bg-emerald-500/15 shadow-[0_0_20px_-4px_rgba(52,211,153,0.55)]',
          )}
          data-message-id={message.id}
          data-tap-save={onToggleSaved && !isVybeMessage && !isSharedPost && !isSharedTheme ? '' : undefined}
          onContextMenu={handleContextMenu}
          onDoubleClick={onToggleReactions}
        >

          {/* Image/GIF message (not for shared posts - they use SharedPostBubble) */}
          {isMediaMessage && !isSharedPost && (
            <div onClick={handleMediaTap} data-no-tap-save className="cursor-pointer">
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
            <div onClick={handleMediaTap} data-no-tap-save className="cursor-pointer">
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
                  <div
                    className="absolute inset-0 opacity-40 animate-vybe-unopened-shimmer"
                    style={{
                      background:
                        'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-3 text-white">
                    <div className="p-3.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 shadow-inner animate-vybe-unopened-breathe">
                      <Camera className="h-6 w-6" />
                    </div>
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
              {(url) => url ? <AudioMessage src={url} isOwn={isOwn} messageId={message.id} /> : <Skeleton className="h-14 w-[220px] rounded-[22px]" />}
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
                senderIds: [profileId, authUserId],
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
          messageType={message.message_type}
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
          onReport={onReport}
          onSave={!isSharedPost && (isMediaMessage || isVideoMessage) && message.media_url ? async () => {
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
          onSaveSticker={!isSharedPost && isMediaMessage && message.media_url && onSaveSticker ? () => onSaveSticker(message.media_url!) : undefined}
          onToggleKeep={onToggleSaved ? () => { onToggleSaved(); closeContextMenu(); } : undefined}
          isKept={mySaved}
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
    messageRowKey(prevProps.message) === messageRowKey(nextProps.message) &&
    prevProps.message.content === nextProps.message.content &&
    (prevProps.message as { _failed?: boolean })._failed === (nextProps.message as { _failed?: boolean })._failed &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.showAvatar === nextProps.showAvatar &&
    prevProps.showReactions === nextProps.showReactions &&
    prevProps.profileId === nextProps.profileId &&
    prevProps.authUserId === nextProps.authUserId &&
    prevProps.reportScope === nextProps.reportScope &&
    prevProps.forceShowContextMenu === nextProps.forceShowContextMenu &&
    prevProps.message.saved_by_sender === nextProps.message.saved_by_sender &&
    prevProps.message.saved_by_recipient === nextProps.message.saved_by_recipient &&
    prevProps.message.expires_at === nextProps.message.expires_at &&
    JSON.stringify(prevProps.message.reactions) === JSON.stringify(nextProps.message.reactions) &&
    JSON.stringify(prevProps.message.views) === JSON.stringify(nextProps.message.views)
  );
});

// formatMessageDate → ./chat-view/formatMessageDate.ts
// The OptimisticMessageBubble component is no longer needed
