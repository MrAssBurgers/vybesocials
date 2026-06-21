import { useState, useEffect, useMemo, memo, useCallback, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useDMConversations, useMarkConversationRead } from '@/hooks/useDMConversations';
import { useChatPrefetch } from '@/hooks/useChatPrefetch';
import { useOnlineFriends } from '@/hooks/useOnlineFriends';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { useTrashedConversationIds, useTrashConversation } from '@/hooks/useTrashedConversations';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { useAcceptedFriendRequests, useDismissAcceptedRequest } from '@/hooks/useAcceptedFriendRequests';
import { useStreakMap, Streak } from '@/hooks/useStreaks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { useConversationListPresence } from '@/hooks/useConversationListPresence';
import { activityPreviewLabel } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PresenceAvatar } from '@/components/chat/PresenceAvatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Pin, Check, Users, UserPlus, Trash2, X, UserCheck, Camera, Search } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

import { toast } from 'sonner';
import { CreateGroupDialog } from './CreateGroupDialog';
import { ConversationOptionsSheet } from './ConversationOptionsSheet';
import { StreakIndicator } from './StreakIndicator';
import { getRecentMessageUsers, type RecentMessageUser } from '@/lib/recentMessageUsers';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { ModBadge } from '@/components/ui/ModBadge';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useUsersRoles } from '@/hooks/useUserRoleById';
import { AvatarRing } from '@/components/ui/AvatarRing';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBatchUserStatuses } from '@/hooks/useUserStatus';
import { getVibeColor } from '@/components/status/StatusPicker';
import { compactTime } from '@/lib/compactTime';
import { formatDmPreviewContent } from '@/lib/callChatMessages';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';
import { NotesRow } from './NotesRow';
import { VybeSnapCamera } from '@/components/camera/VybeSnapCamera';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { NowPlayingInline } from '@/components/music/NowPlayingInline';
import { MessageRequestsBadge } from './MessageRequestsList';
import { usePendingRequestCount } from '@/hooks/useMessageRequests';
import { DMsHeader } from './DMsHeader';
import { cn } from '@/lib/utils';
import { navVisibility } from '@/lib/navVisibility';
import { useAgentAvailabilityProbe } from '@/hooks/useAgentAvailabilityProbe';
import {
  displayNameForConversation,
  inferOtherUserIdFromConversation,
  isViewerMember,
  resolveOtherMemberFromConversation,
} from '@/lib/dmMemberResolve';

const AutisyAIChatRow = memo(function AutisyAIChatRow() {
  const navigate = useNavigate();

  const aiName = 'VYBE-AI';

  // Get last AI message from localStorage for preview
  const lastAIMessage = useMemo(() => {
    try {
      const stored = localStorage.getItem('vybe_ai_chat_messages_v2');
      if (stored) {
        const messages = JSON.parse(stored);
        const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
        if (lastAssistant?.content) {
          const text = String(lastAssistant.content);
          if (/GEMINI_API_KEY|VYBE AI server failed|not configured/i.test(text)) {
            return "Hey! Tap to chat with me ✨";
          }
          return text;
        }
      }
    } catch {}
    return "Hey! Tap to chat with me ✨";
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate('/VYBE-AI')}
      className="dm-ai-row w-full flex items-center gap-3 text-left box-border"
    >
      <div className="relative flex-shrink-0">
        <div className="h-12 w-12 rounded-full p-[2px] bg-gradient-to-br from-primary via-accent to-primary">
          <div className="h-full w-full rounded-full bg-background flex items-center justify-center">
            <VybeMiniIcon size={22} showSparkles />
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <span className="font-semibold text-[0.9375rem] truncate flex items-center gap-1">
            {aiName}
            <span className="text-[9px] font-bold text-primary px-1.5 py-0.5 rounded-full bg-primary/10">AI</span>
          </span>
        </div>
        <p className="dm-convo-preview truncate">{lastAIMessage.slice(0, 48)}…</p>
      </div>
    </button>
  );
});

// Debug flag for dev visibility - moved inside component

export function ConversationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, loading: authLoading, user, refreshProfile } = useAuth();
  const profileId = useAuthProfileId();
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'streaks'>('all');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [navPadVisible, setNavPadVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribeEffective(setNavPadVisible);
  }, []);
  
  // Use the new optimized DM conversations hook with auto-creation
  const {
    pinnedConversations,
    unpinnedConversations,
    isLoading,
    isFetched,
    error: convError,
    totalUnreadCount,
    refetch: refetchConversations,
    profileId: dmProfileId,
  } = useDMConversations(debouncedSearch);
  const { prefetchMessages } = useChatPrefetch();

  useAgentAvailabilityProbe();
  
  const { onlineFriends, onlineCount, isLoading: onlineLoading } = useOnlineFriends();
  const createConversation = useCreateConversation();
  const { data: trashedIds } = useTrashedConversationIds();
  const trashConversation = useTrashConversation();
  const { data: storyGroups } = useStories();
  const { data: pendingRequestCount = 0 } = usePendingRequestCount();
  const { data: acceptedRequests } = useAcceptedFriendRequests();
  const dismissAccepted = useDismissAcceptedRequest();
  const streakMap = useStreakMap();
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showSnapCamera, setShowSnapCamera] = useState(false);
  const [recentUsers, setRecentUsers] = useState<RecentMessageUser[]>([]);
  const [storyViewerIndex, setStoryViewerIndex] = useState<number | null>(null);
  
  // Create a map of user IDs to story groups for quick lookup
  const userStoryMap = useMemo(() => {
    const map = new Map<string, StoryGroup>();
    storyGroups?.forEach(group => {
      map.set(group.user.id, group);
    });
    return map;
  }, [storyGroups]);

  // Open the story viewer for a user (there is no /stories route — the old
  // navigate('/stories/...') call 404'd to NotFound)
  const openStoryForUser = useCallback((userId: string) => {
    const idx = storyGroups?.findIndex(g => g.user.id === userId) ?? -1;
    if (idx >= 0) setStoryViewerIndex(idx);
  }, [storyGroups]);
  
  // Debug logging in dev mode
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[DM Debug]', {
        currentUserId: profile?.id,
        pinnedCount: pinnedConversations?.length || 0,
        unpinnedCount: unpinnedConversations?.length || 0,
        totalUnread: totalUnreadCount,
        onlineCount,
        isLoading,
        convError: convError?.message,
      });
    }
  }, [profile?.id, pinnedConversations, unpinnedConversations, totalUnreadCount, onlineCount, isLoading, convError]);

  // Get user IDs for online status check - memoized
  const allConversations = useMemo(() => 
    [...(pinnedConversations || []), ...(unpinnedConversations || [])],
    [pinnedConversations, unpinnedConversations]
  );

  const profileMissing = !authLoading && !!user && !dmProfileId;
  const showListSkeleton =
    allConversations.length === 0 &&
    !profileMissing &&
    isLoading &&
    !isFetched;

  const showConvRetry =
    !!convError &&
    isFetched &&
    allConversations.length === 0 &&
    !profileMissing;

  const conversationIds = useMemo(() => 
    allConversations.map(c => c.id),
    [allConversations]
  );
  
  // Typing indicators — cap tracked conversations to keep realtime light.
  const typingConversationIds = useMemo(
    () => conversationIds.slice(0, 30),
    [conversationIds],
  );
  const { isTyping: checkTyping } = useConversationTyping(typingConversationIds);
  const peerActivityByConv = useConversationListPresence(allConversations, profileId, user?.id);
  
  const otherMemberIds = useMemo(() => {
    if (!allConversations.length || !profileId) return [];
    const ids = new Set<string>();
    const cap = 40;
    for (const conv of allConversations) {
      if (ids.size >= cap) break;
      if (conv.is_group) continue;
      const otherId = inferOtherUserIdFromConversation(conv, profileId, user?.id);
      if (otherId) ids.add(otherId);
      conv.members?.forEach((m) => {
        if (!isViewerMember(m.user_id, profileId, user?.id) && m.profile?.id) {
          ids.add(String(m.profile.id));
        }
      });
    }
    return Array.from(ids).slice(0, cap);
  }, [allConversations, profileId, user?.id]);

  const { data: onlineStatus = {} } = useUsersOnlineStatus(otherMemberIds);
  const { data: usersRoles = {} } = useUsersRoles(otherMemberIds);
  const { data: statusMap = new Map() } = useBatchUserStatuses(otherMemberIds);

  useEffect(() => {
    setRecentUsers(getRecentMessageUsers());
  }, []);




  const handleQuickAddSelect = useCallback(async (userId: string) => {
    if (!profileId) {
      toast.error("Please wait, loading your profile...");
      return;
    }
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [userId] });
      navigate(`/messages/${conversation.id}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start conversation');
    }
  }, [profileId, createConversation, navigate]);

  // Filter conversations based on selected tab
  const filteredPinned = useMemo(() => {
    if (!pinnedConversations) return [];
    return pinnedConversations.filter(conv => {
      if (chatFilter === 'unread') return (conv.unread_count || 0) > 0;
      if (chatFilter === 'groups') return conv.is_group;
      if (chatFilter === 'streaks') {
        const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profileId)?.profile?.id : undefined;
        return otherMemberId ? (streakMap.get(otherMemberId)?.streak_count || 0) > 0 : false;
      }
      return true;
    });
  }, [pinnedConversations, chatFilter, profileId, streakMap]);

  const filteredUnpinned = useMemo(() => {
    if (!unpinnedConversations) return [];
    return unpinnedConversations.filter(conv => {
      if (chatFilter === 'unread') return (conv.unread_count || 0) > 0;
      if (chatFilter === 'groups') return conv.is_group;
      if (chatFilter === 'streaks') {
        const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profileId)?.profile?.id : undefined;
        return otherMemberId ? (streakMap.get(otherMemberId)?.streak_count || 0) > 0 : false;
      }
      return true;
    });
  }, [unpinnedConversations, chatFilter, profileId, streakMap]);

  const handleConversationClick = useCallback((convId: string) => {
    void prefetchMessages(convId);
    navigate(`/messages/${convId}`);
  }, [navigate, prefetchMessages]);

  const handleConversationWarm = useCallback((convId: string) => {
    void prefetchMessages(convId);
  }, [prefetchMessages]);

  const handleTrashConversation = useCallback((convId: string) => {
    trashConversation.mutate(convId);
  }, [trashConversation]);


  return (
    <div className="flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden">
      <DMsHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        chatFilter={chatFilter}
        onFilterChange={setChatFilter}
        totalUnreadCount={totalUnreadCount}
        isTrashOpen={isTrashOpen}
        onTrashOpenChange={setIsTrashOpen}
        onCreateGroup={() => setIsGroupDialogOpen(true)}
      />
      
      {/* Create Group Dialog */}
      <CreateGroupDialog 
        open={isGroupDialogOpen}
        onOpenChange={setIsGroupDialogOpen}
        onSuccess={(conversationId) => {
          navigate(`/messages/${conversationId}`);
        }}
      />

      {/* Conversation List */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroller',
          navPadVisible
            ? 'pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]'
            : 'pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]',
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
        }}
      >

        {/* Notes Row - Instagram/Snapchat style */}
        <NotesRow />

        {/* AI Chat Row */}
        <AutisyAIChatRow />

        {pendingRequestCount > 0 && (
          <div className="px-3 pb-2">
            <MessageRequestsBadge count={pendingRequestCount} />
          </div>
        )}

        {/* Accepted Friend Requests */}
        {acceptedRequests && acceptedRequests.length > 0 && (
          <div className="px-3 space-y-1">
            {acceptedRequests.map((request) => (
              <AcceptedFriendChatRow 
                key={request.id}
                request={request}
                onDismiss={() => dismissAccepted.mutate(request.id)}
                onMessage={handleQuickAddSelect}
              />
            ))}
          </div>
        )}

        {/* Conversations */}
        <div className="pb-3">
          {profileMissing ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6 mx-1">
              <p className="text-sm text-muted-foreground mb-4 max-w-[260px]">
                Couldn&apos;t load your profile. Messages need your profile ID to load chats.
              </p>
              <Button variant="secondary" onClick={() => void refreshProfile()} className="rounded-full px-5 h-9 text-sm">
                Retry
              </Button>
            </div>
          ) : showListSkeleton ? (
            <div className="space-y-3 px-3 pt-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (filteredPinned.length > 0 || filteredUnpinned.length > 0) ? (
            <>
              {filteredPinned.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  currentUserId={profileId}
                  viewerAuthUid={user?.id}
                  userStoryMap={userStoryMap}
                  streakMap={streakMap}
                  onlineStatus={onlineStatus}
                  usersRoles={usersRoles}
                  statusMap={statusMap}
                  isTypingFn={checkTyping}
                  peerActivity={peerActivityByConv.get(conv.id)}
                  onClick={handleConversationClick}
                  onWarm={handleConversationWarm}
                  onTrash={handleTrashConversation}
                  onOpenStory={openStoryForUser}
                />
              ))}
              {filteredUnpinned.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  currentUserId={profileId}
                  viewerAuthUid={user?.id}
                  userStoryMap={userStoryMap}
                  streakMap={streakMap}
                  onlineStatus={onlineStatus}
                  usersRoles={usersRoles}
                  statusMap={statusMap}
                  isTypingFn={checkTyping}
                  peerActivity={peerActivityByConv.get(conv.id)}
                  onClick={handleConversationClick}
                  onWarm={handleConversationWarm}
                  onTrash={handleTrashConversation}
                  onOpenStory={openStoryForUser}
                />
              ))}
            </>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No results</p>
              <p className="text-xs text-muted-foreground mt-1">No conversations matching "{searchQuery}"</p>
              <Button variant="ghost" size="sm" className="mt-3 rounded-full" onClick={() => setSearchQuery('')}>
                Clear
              </Button>
            </div>
          ) : chatFilter !== 'all' ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <p className="text-sm text-muted-foreground">No {chatFilter} conversations</p>
            </div>
          ) : (
            <div className="dm-empty-state flex flex-col items-center justify-center py-12 text-center px-6 mx-1">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 ring-2 ring-primary/20">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <h3 className="dm-title text-lg font-black mb-1">{t('messages.noConversations')}</h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-[240px]">
                {showConvRetry ? "We couldn't load your chats. Tap Retry below." : "Add friends to start chatting. Your conversations will show up here."}
              </p>
              <div className="flex gap-2">
                {showConvRetry && (
                  <Button variant="secondary" onClick={() => refetchConversations()} className="rounded-full px-4 h-9 text-sm">
                    Retry
                  </Button>
                )}
                <Button onClick={() => navigate('/messages/new')} className="rounded-full px-5 h-9 text-sm">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Find Friends
                </Button>
                <Button variant="outline" onClick={() => navigate('/search')} className="rounded-full px-4 h-9 text-sm">
                  Explore
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Recommended Friends - Snapchat Quick Add style */}
        {!searchQuery && chatFilter === 'all' && (
          <RecommendedFriendsSection />
        )}
      </div>

      {/* VybeSnap Camera */}
      {showSnapCamera && (
        <CameraMountBoundary onError={() => setShowSnapCamera(false)}>
          <VybeSnapCamera
            isOpen={showSnapCamera}
            onClose={() => setShowSnapCamera(false)}
            onSend={() => {
              setShowSnapCamera(false);
              toast.success('Snap saved!');
            }}
          />
        </CameraMountBoundary>
      )}

      {/* Story viewer — opened by tapping an avatar with an active story ring */}
      <AnimatePresence>
        {storyViewerIndex !== null && storyGroups && (
          <StoryViewer
            groups={storyGroups}
            initialGroupIndex={storyViewerIndex}
            onClose={() => setStoryViewerIndex(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Accepted Friend Request as Chat Row (inline notification style)
const AcceptedFriendChatRow = memo(function AcceptedFriendChatRow({
  request,
  onDismiss,
  onMessage,
}: {
  request: { id: string; acceptedBy?: { id: string; username: string; avatar_url: string | null; display_name: string | null } };
  onDismiss: () => void;
  onMessage: (userId: string) => void;
}) {
  const navigate = useNavigate();
  const person = request.acceptedBy;

  if (!person) return null;

  const handleRowClick = () => {
    onMessage(person.id);
    onDismiss();
  };

  return (
    <div 
      className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 active:scale-[0.98] transition-all mb-0.5 cursor-pointer box-border border border-green-500/20"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/u/${person.username}`);
        }}
        className="relative flex-shrink-0"
      >
        <Avatar className="h-12 w-12 ring-2 ring-green-500/30 shadow-md">
          <AvatarImage src={person.avatar_url || undefined} />
          <AvatarFallback className="text-base">{person.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
          <UserCheck className="h-2.5 w-2.5 text-white" />
        </div>
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <span className="font-semibold text-sm truncate flex-1 min-w-0">{person.display_name || person.username}</span>
          <span className="text-[10px] text-green-600 dark:text-green-400 whitespace-nowrap flex-shrink-0">New friend</span>
        </div>
        <p className="text-xs text-green-600 dark:text-green-400 truncate">
          Accepted your friend request! Tap to message 💬
        </p>
      </div>
      
      <Button
        size="icon"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="h-8 w-8 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
});

// Swipe threshold for delete action - more generous for easier swiping
const SWIPE_THRESHOLD = -60;

// Shared conversation content component - simplified without the options menu
const ConversationContent = memo(forwardRef<HTMLDivElement, any>(function ConversationContent({
  conversation,
  displayName,
  avatarUrl,
  lastMessage,
  unreadCount,
  isPinned,
  memberCount,
  formattedTime,
  isOnline,
  peerActivity = 'idle',
  currentUserId,
  userRole,
  hasStory,
  storyGroup,
  handleAvatarClick,
  otherMember,
  streak,
  userStatus,
}, _ref) {
  const livePreview = activityPreviewLabel(peerActivity);
  const showLiveActivity = peerActivity !== 'idle' && livePreview;

  return (
    <>
      <div className="relative flex-shrink-0">
        {conversation.is_group ? (
          <div className="relative">
            <Avatar className="h-12 w-12">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} />
              ) : (
                <AvatarFallback className="text-sm bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 bg-primary text-primary-foreground text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center border-2 border-background">
              {memberCount}
            </div>
          </div>
        ) : (
          <button onClick={handleAvatarClick} className="block relative">
            <AvatarRing
              size="lg"
              variant={userStatus ? 'vibe' : 'default'}
              vibeColor={userStatus ? getVibeColor(userStatus.emoji) : undefined}
              vibeEmoji={userStatus?.emoji}
            >
              <div className={`relative ${hasStory ? 'p-0.5' : ''} w-full h-full`}>
                {hasStory && (
                  <div className={`absolute inset-0 rounded-full ${storyGroup?.hasUnviewed ? 'bg-gradient-to-tr from-primary via-accent to-primary' : 'bg-muted-foreground/25'}`} />
                )}
                <PresenceAvatar
                  src={avatarUrl}
                  username={otherMember?.username}
                  displayName={otherMember?.display_name}
                  activity={peerActivity}
                  size="lg"
                  showOnlineDot
                  isOnline={isOnline}
                  className={hasStory ? 'relative h-full w-full' : undefined}
                />
              </div>
            </AvatarRing>
          </button>
        )}
        {isPinned && (
          <div className="dm-convo-pin-badge">
            <Pin className="h-2.5 w-2.5 text-primary-foreground fill-primary-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {!conversation.is_group && otherMember ? (
              <StyledUsername
                userId={otherMember.id}
                username={otherMember.username || 'User'}
                displayName={otherMember.display_name}
                className="dm-convo-name truncate"
              />
            ) : (
              <span className="dm-convo-name truncate">{displayName}</span>
            )}
            {!conversation.is_group && userRole && <ModBadge role={userRole} />}
            {conversation.is_group && (
              <span className="text-[10px] text-muted-foreground flex-shrink-0">Group</span>
            )}
            {!conversation.is_group && otherMember && isOwner(otherMember.username || '') && <OwnerBadge />}
            {!conversation.is_group && otherMember && isOwnerWife(otherMember.id) && <OwnerWifeRingBadge />}
            {!conversation.is_group && streak && streak.streak_count > 0 && (
              <StreakIndicator 
                count={streak.streak_count} 
                expiresAt={streak.expires_at}
                size="sm"
              />
            )}
          </div>
          {formattedTime && (
            <span className="dm-convo-time whitespace-nowrap flex-shrink-0">
              {formattedTime}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {showLiveActivity ? (
              peerActivity === 'typing' ? (
                <div className="flex items-center gap-1.5 text-primary">
                  <TypingIndicator size="sm" />
                  <span className="text-xs font-medium">{livePreview}</span>
                </div>
              ) : (
                <p className="dm-convo-preview truncate text-primary font-medium">{livePreview}</p>
              )
            ) : lastMessage ? (
              <>
                {lastMessage.sender_id === currentUserId ? (
                  lastMessage.media_type === 'vybe' ? (
                    <span className="dm-convo-status-icon text-red-400">▶</span>
                  ) : lastMessage.media_type === 'audio' ? (
                    <span className="dm-convo-status-icon text-purple-400">▶</span>
                  ) : (
                    <span className="dm-convo-status-icon">▶</span>
                  )
                ) : (
                  lastMessage.media_type === 'vybe' ? (
                    <span className="dm-convo-status-icon text-red-400">◼</span>
                  ) : lastMessage.media_type === 'audio' ? (
                    <span className="dm-convo-status-icon text-purple-400">◼</span>
                  ) : (
                    <span className="dm-convo-status-icon">◼</span>
                  )
                )}
                <p className="dm-convo-preview truncate flex-1 min-w-0">
                  {lastMessage.sender_id === currentUserId
                    ? lastMessage.viewed_at
                      ? 'Opened'
                      : 'Delivered'
                    : lastMessage.media_type === 'vybe'
                    ? 'New Snap'
                    : lastMessage.media_type === 'image'
                    ? 'Photo'
                    : lastMessage.media_type === 'video'
                    ? 'Video'
                    : lastMessage.media_type === 'audio'
                    ? 'Voice note'
                    : lastMessage.media_type === 'gif'
                    ? 'GIF'
                    : formatDmPreviewContent(lastMessage, false)}
                </p>
              </>
            ) : (otherMember as any)?.user_id ? (
              <NowPlayingInline authUserId={(otherMember as any).user_id} className="truncate dm-convo-preview" />
            ) : null}
            {!showLiveActivity && !lastMessage && userStatus && !(otherMember as any)?.user_id && (
              <p className="dm-convo-preview truncate italic">
                {userStatus.emoji} {userStatus.text}
              </p>
            )}
            {!showLiveActivity && !lastMessage && conversation.is_group && (
              <p className="dm-convo-preview truncate">Say hi 👋</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {unreadCount > 0 && <span className="dm-convo-activity-dot" aria-label="Unread" />}
            {lastMessage &&
              lastMessage.media_type === 'vybe' &&
              lastMessage.sender_id !== currentUserId &&
              !lastMessage.viewed_at && (
                <span
                  className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500/15"
                  aria-label="New Vybe Snap"
                >
                  <Camera className="h-3 w-3 text-red-500" />
                </span>
              )}
            {unreadCount > 1 && (
              <span className="dm-unread-badge text-primary-foreground font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}));

// Memoized conversation item with swipe-to-delete on mobile and long-press for options
// Lightweight wrapper that derives row-specific props from shared maps,
// passes stable id-based onClick/onTrash through, and lets memo skip rerenders
// when only unrelated conversations change.
interface ConversationRowProps {
  conv: Conversation;
  currentUserId?: string;
  viewerAuthUid?: string;
  userStoryMap: Map<string, StoryGroup>;
  streakMap: Map<string, Streak>;
  onlineStatus: Record<string, boolean>;
  usersRoles: Record<string, 'admin' | 'moderator' | 'owner' | null>;
  statusMap: Map<string, { emoji: string; text: string } | undefined>;
  isTypingFn: (id: string) => boolean;
  peerActivity?: ActivityType;
  onClick: (id: string) => void;
  onWarm?: (id: string) => void;
  onTrash: (id: string) => void;
  onOpenStory?: (userId: string) => void;
}

const ConversationRow = memo(function ConversationRow({
  conv,
  currentUserId,
  viewerAuthUid,
  userStoryMap,
  streakMap,
  onlineStatus,
  usersRoles,
  statusMap,
  isTypingFn,
  peerActivity: peerActivityProp,
  onClick,
  onWarm,
  onTrash,
  onOpenStory,
}: ConversationRowProps) {
  const resolvedOther = !conv.is_group
    ? resolveOtherMemberFromConversation(conv, currentUserId, viewerAuthUid)
    : null;
  const otherMemberId = resolvedOther?.profile?.id
    ? String(resolvedOther.profile.id)
    : undefined;
  const hasStory = otherMemberId ? userStoryMap.has(otherMemberId) : false;
  const storyGroup = otherMemberId ? userStoryMap.get(otherMemberId) : undefined;
  const streak = otherMemberId ? streakMap.get(otherMemberId) : undefined;
  const handleClick = useCallback(() => onClick(conv.id), [onClick, conv.id]);
  const handleWarm = useCallback(() => onWarm?.(conv.id), [onWarm, conv.id]);
  const handleTrash = useCallback(() => onTrash(conv.id), [onTrash, conv.id]);
  const peerActivity: ActivityType =
    peerActivityProp ?? (isTypingFn(conv.id) ? 'typing' : 'idle');
  return (
    <ConversationItem
      conversation={conv}
      onClick={handleClick}
      onWarm={handleWarm}
      isOnline={otherMemberId ? onlineStatus[otherMemberId] : false}
      peerActivity={peerActivity}
      currentUserId={currentUserId}
      viewerAuthUid={viewerAuthUid}
      userRole={otherMemberId ? usersRoles[otherMemberId] : null}
      onTrash={handleTrash}
      hasStory={hasStory}
      storyGroup={storyGroup}
      streak={streak}
      userStatus={otherMemberId ? (statusMap as any).get?.(otherMemberId) : undefined}
      onOpenStory={onOpenStory}
    />
  );
});

interface ConversationItemProps {
  conversation: Conversation; 
  onClick: () => void;
  onWarm?: () => void;
  isOnline?: boolean;
  peerActivity?: ActivityType;
  currentUserId?: string;
  viewerAuthUid?: string;
  userRole?: 'admin' | 'moderator' | 'owner' | null;
  onTrash?: () => void;
  hasStory?: boolean;
  storyGroup?: StoryGroup;
  streak?: Streak;
  userStatus?: { emoji: string; text: string } | null;
  onOpenStory?: (userId: string) => void;
}

const ConversationItem = memo(forwardRef<HTMLDivElement, ConversationItemProps>(function ConversationItem({ 
  conversation, 
  onClick,
  onWarm,
  isOnline,
  peerActivity = 'idle',
  currentUserId,
  viewerAuthUid,
  userRole,
  onTrash,
  hasStory,
  storyGroup,
  streak,
  userStatus,
  onOpenStory,
}, _ref) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  
  // Swipe gesture handling - more generous transforms for better UX
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-120, -40, -15, 0], [1, 0.8, 0, 0]);
  const deleteScale = useTransform(x, [-120, -40, -15, 0], [1, 0.95, 0.5, 0.3]);
  const deleteBgOpacity = useTransform(x, [-100, -30, -10, 0], [1, 0.6, 0, 0]);
  const deleteVisibility = useTransform(x, (v) => (v < -5 ? 'visible' : 'hidden') as 'visible' | 'hidden');
  
  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const wasHorizontalSwipe = Math.abs(info.offset.x) > 12;
    if (info.offset.x < SWIPE_THRESHOLD && onTrash) {
      // Haptic feedback on delete
      if (navigator.vibrate) {
        navigator.vibrate([15, 30, 15]);
      }
      setIsDeleting(true);
      // Wait for the exit animation to complete before calling onTrash
      setTimeout(() => {
        onTrash();
      }, 400);
    }
    // Block the synthetic click after a horizontal swipe so we don't open the chat.
    if (wasHorizontalSwipe) {
      isDraggingRef.current = true;
      window.setTimeout(() => {
        isDraggingRef.current = false;
      }, 350);
    } else {
      isDraggingRef.current = false;
    }
  }, [onTrash]);

  const handleDrag = useCallback((_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 8) {
      isDraggingRef.current = true;
    }
  }, []);

  const handleDragStart = useCallback(() => {
    // Don't set isDraggingRef here — a plain tap would block navigation.
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  // Long press handlers with scroll/movement detection
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    onWarm?.();
    isLongPressRef.current = false;
    isDraggingRef.current = false;
    
    // Store initial touch position
    if ('touches' in e) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
    }
    
    longPressTimerRef.current = setTimeout(() => {
      // Only trigger if not dragging/scrolling
      if (!isDraggingRef.current) {
        isLongPressRef.current = true;
        setOptionsOpen(true);
      }
    }, 500);
  }, [onWarm]);

  const handleTouchMove = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current) return;
    
    let currentX: number, currentY: number;
    if ('touches' in e) {
      currentX = e.touches[0].clientX;
      currentY = e.touches[0].clientY;
    } else {
      currentX = e.clientX;
      currentY = e.clientY;
    }
    
    const dx = Math.abs(currentX - touchStartPosRef.current.x);
    const dy = Math.abs(currentY - touchStartPosRef.current.y);
    
    // If moved more than 5px vertically (scrolling), cancel long press immediately
    if (dy > 5 || dx > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    touchStartPosRef.current = null;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    if (isLongPressRef.current) return;
    if (isDraggingRef.current) return;
    onClick();
  }, [onClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);
  
  const otherMembers = useMemo(
    () =>
      conversation.members?.filter(
        (m) => !isViewerMember(m.user_id, currentUserId, viewerAuthUid),
      ) || [],
    [conversation.members, currentUserId, viewerAuthUid],
  );
  const resolvedOther = useMemo(
    () => resolveOtherMemberFromConversation(conversation, currentUserId, viewerAuthUid),
    [conversation, currentUserId, viewerAuthUid],
  );
  const otherMember = resolvedOther?.profile;

  const displayName = displayNameForConversation(
    conversation,
    currentUserId,
    viewerAuthUid,
  );
  
  const avatarUrl = conversation.is_group
    ? conversation.avatar_url
    : otherMember?.avatar_url;
  
  const lastMessage = conversation.last_message;
  const unreadCount = conversation.unread_count || 0;
  const isPinned = conversation.members?.find((m) =>
    isViewerMember(m.user_id, currentUserId, viewerAuthUid),
  )?.is_pinned;
  const memberCount = conversation.is_group ? (conversation.members?.length || 0) : 0;

  const formattedTime = useMemo(() => {
    if (!lastMessage?.created_at) return null;
    return compactTime(lastMessage.created_at);
  }, [lastMessage?.created_at]);

  const isMuted = conversation.members?.find((m) =>
    isViewerMember(m.user_id, currentUserId, viewerAuthUid),
  )?.is_muted;

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!conversation.is_group && otherMember) {
      if (hasStory && storyGroup && onOpenStory) {
        onOpenStory(storyGroup.user.id);
      } else {
        navigate(`/u/${otherMember.username}`);
      }
    }
  };

  const sharedProps = {
    conversation,
    displayName,
    avatarUrl,
    lastMessage,
    unreadCount,
    isPinned,
    memberCount,
    formattedTime,
    isOnline,
    peerActivity,
    currentUserId,
    userRole,
    hasStory,
    storyGroup,
    handleAvatarClick,
    otherMember,
    streak,
    userStatus,
  };

  // Mobile swipeable version with long-press for options
  if (isMobile && onTrash) {
    return (
      <>
        <div className="relative mb-0.5">
          {/* Delete indicator - hidden at rest, slowly reveals behind frosted glass on swipe */}
          <motion.div 
            className="absolute inset-0 flex items-center justify-end pointer-events-none"
            style={{ 
              opacity: deleteBgOpacity,
              visibility: deleteVisibility,
              borderRadius: '0.75rem',
              background: 'hsl(var(--destructive))',
            }}
          >
            <motion.div 
              style={{ scale: deleteScale, opacity: deleteOpacity }} 
              className="flex flex-col items-center gap-0.5 text-destructive-foreground pr-6"
            >
              <Trash2 className="h-5 w-5" />
              <span className="text-[10px] font-medium">Delete</span>
            </motion.div>
          </motion.div>
          
          {/* Swipeable item - more generous drag for easier swiping */}
          <motion.div 
            className="relative overflow-hidden"
            style={{ x }}
            drag="x"
            dragConstraints={{ left: -120, right: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            animate={isDeleting ? { x: -400, opacity: 0, height: 0, marginBottom: 0 } : { x: 0 }}
            transition={isDeleting ? { duration: 0.35, ease: [0.4, 0, 0.2, 1] } : { type: 'spring', stiffness: 400, damping: 35 }}
          >
            <div 
              className={cn(
                'group dm-convo-row w-full flex items-center gap-3 text-left cursor-pointer box-border',
                unreadCount > 0 && 'dm-convo-row--unread',
                isPinned && 'dm-convo-row--pinned'
              )}
              onClick={handleClick}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleTouchStart}
              onMouseMove={handleTouchMove}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
            >
              <ConversationContent {...sharedProps} />
            </div>
          </motion.div>
        </div>
        
        {/* Options sheet for long press */}
        <ConversationOptionsSheet
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          conversationId={conversation.id}
          otherUserId={!conversation.is_group ? otherMember?.id : undefined}
          otherUsername={!conversation.is_group ? otherMember?.username : undefined}
          otherDisplayName={displayName}
          otherAvatarUrl={avatarUrl}
          isMuted={isMuted}
          isPinned={isPinned}
        />
      </>
    );
  }

  // Desktop version with long-press/right-click for options
  return (
    <>
      <div 
        className={cn(
          'group relative dm-convo-row w-full flex items-center gap-3 text-left cursor-pointer box-border',
          unreadCount > 0 && 'dm-convo-row--unread',
          isPinned && 'dm-convo-row--pinned'
        )}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault();
          setOptionsOpen(true);
        }}
      >
        <ConversationContent {...sharedProps} />
      </div>
      
      {/* Options sheet for long press/right-click */}
      <ConversationOptionsSheet
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        conversationId={conversation.id}
        otherUserId={!conversation.is_group ? otherMember?.id : undefined}
        otherUsername={!conversation.is_group ? otherMember?.username : undefined}
        otherDisplayName={displayName}
        otherAvatarUrl={avatarUrl}
        isMuted={isMuted}
        isPinned={isPinned}
      />
    </>
  );
}));

// Recommended Friends Section - Snapchat Quick Add style at bottom of DMs
const RecommendedFriendsSection = memo(function RecommendedFriendsSection() {
  const navigate = useNavigate();
  const { suggestions, isLoading } = useQuickAddSuggestions(8);
  const sendRequest = useSendFriendRequest();
  const { dismissUser } = useDismissedQuickAdd();
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  if (isLoading || suggestions.length === 0) return null;

  const visible = suggestions.filter(s => !localDismissed.has(s.id));
  if (visible.length === 0) return null;

  const handleAdd = (userId: string) => {
    setAdded(prev => new Set([...prev, userId]));
    sendRequest.mutate(userId, {
      onSuccess: () => {
        setTimeout(() => {
          setLocalDismissed(prev => new Set([...prev, userId]));
          dismissUser(userId);
        }, 800);
      },
      onError: () => setAdded(prev => { const n = new Set(prev); n.delete(userId); return n; }),
    });
  };

  const handleDismiss = (userId: string) => {
    setLocalDismissed(prev => new Set([...prev, userId]));
    dismissUser(userId);
  };

  return (
    <div className="px-3 pb-4">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="dm-quick-add-label">Quick Add</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-primary" onClick={() => navigate('/messages/new')}>
          More
        </Button>
      </div>
      <div className="space-y-0.5">
        <AnimatePresence initial={false}>
          {visible.map((person) => (
            <motion.div
              key={person.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-muted/40 transition-colors"
            >
              <button onClick={() => navigate(`/u/${person.username}`)} className="flex-shrink-0">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={person.avatar_url || undefined} />
                  <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                    {(person.display_name || person.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{person.display_name || person.username}</p>
                <p className="text-[11px] text-muted-foreground">{person.subtitle}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {added.has(person.id) ? (
                  <div className="h-7 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </div>
                ) : (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleAdd(person.id)}
                      className="h-7 rounded-full text-[10px] font-semibold gap-1 px-3"
                    >
                      <UserPlus className="h-3 w-3" />
                      Add
                    </Button>
                    <button
                      onClick={() => handleDismiss(person.id)}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});
