import { useState, useEffect, useMemo, memo, useCallback, useRef, forwardRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
import { useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useDMConversations, useMarkConversationRead } from '@/hooks/useDMConversations';
import { useRealtimeConversations } from '@/hooks/useRealtimeMessages';
import { useOnlineFriends } from '@/hooks/useOnlineFriends';
import { useAuth } from '@/lib/auth';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { useTrashedConversationIds, useTrashConversation } from '@/hooks/useTrashedConversations';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { useAcceptedFriendRequests, useDismissAcceptedRequest } from '@/hooks/useAcceptedFriendRequests';
import { useStreakMap, Streak } from '@/hooks/useStreaks';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useConversationTyping } from '@/hooks/useConversationTyping';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus, Bot, UsersRound, Trash2, Nfc, X, UserCheck, Flame, Camera } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

import { toast } from 'sonner';
import { CreateGroupDialog } from './CreateGroupDialog';
import { ConversationOptionsSheet } from './ConversationOptionsSheet';
import { TrashBin } from './TrashBin';
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
import { StatusPicker, getVibeColor } from '@/components/status/StatusPicker';
import { compactTime } from '@/lib/compactTime';
import { useQuickAddSuggestions } from '@/hooks/useQuickAddSuggestions';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';
import { NotesRow } from './NotesRow';
import { VybeSnapCamera } from '@/components/camera/VybeSnapCamera';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { useSendFriendRequest } from '@/hooks/useFriends';

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
        if (lastAssistant) return lastAssistant.content;
      }
    } catch {}
    return "Hey! Tap to chat with me ✨";
  }, []);

  return (
    <button
      onClick={() => navigate('/VYBE-AI')}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 active:scale-[0.98] transition-all mb-0.5 box-border"
    >
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-accent to-primary blur-md opacity-60 animate-pulse" />
        <div className="relative h-12 w-12 rounded-full p-[2px] bg-gradient-to-br from-primary via-accent to-primary shadow-lg shadow-primary/40">
          <div className="h-full w-full rounded-full bg-gradient-to-br from-background via-card to-background flex items-center justify-center overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20" />
            <VybeMiniIcon size={24} showSparkles className="relative z-10 drop-shadow-[0_0_6px_hsl(var(--primary)/0.8)]" />
            <div className="absolute -top-1 -right-1 w-8 h-8 bg-primary/30 rounded-full blur-xl" />
          </div>
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-background shadow-md shadow-green-500/50" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <span className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
            <span className="truncate">{aiName}</span>
            <VybeMiniIcon size={12} showSparkles className="flex-shrink-0" />
          </span>
          <span className="text-[9px] font-semibold text-primary px-1.5 py-0.5 bg-primary/10 rounded-full flex-shrink-0">AI</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{lastAIMessage.slice(0, 50)}...</p>
      </div>
    </button>
  );
});

// Debug flag for dev visibility - moved inside component

export function ConversationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'groups' | 'streaks'>('all');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  
  // Use the new optimized DM conversations hook with auto-creation
  const { 
    pinnedConversations, 
    unpinnedConversations, 
    isLoading, 
    error: convError,
    totalUnreadCount,
  } = useDMConversations(debouncedSearch);
  
  // Enable instant realtime updates for conversations
  useRealtimeConversations();
  const { onlineFriends, onlineCount, isLoading: onlineLoading } = useOnlineFriends();
  const createConversation = useCreateConversation();
  const { data: trashedIds } = useTrashedConversationIds();
  const trashConversation = useTrashConversation();
  const { data: storyGroups } = useStories();
  const { data: acceptedRequests } = useAcceptedFriendRequests();
  const dismissAccepted = useDismissAcceptedRequest();
  const streakMap = useStreakMap();
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [showSnapCamera, setShowSnapCamera] = useState(false);
  const [recentUsers, setRecentUsers] = useState<RecentMessageUser[]>([]);
  
  // Create a map of user IDs to story groups for quick lookup
  const userStoryMap = useMemo(() => {
    const map = new Map<string, StoryGroup>();
    storyGroups?.forEach(group => {
      map.set(group.user.id, group);
    });
    return map;
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
  
  // Get all conversation IDs for typing indicator subscription
  const conversationIds = useMemo(() => 
    allConversations.map(c => c.id),
    [allConversations]
  );
  
  // Subscribe to typing indicators for all conversations
  const { isTyping: checkTyping } = useConversationTyping(conversationIds);
  
  const otherMemberIds = useMemo(() => {
    if (!allConversations.length || !profile?.id) return [];
    const ids = new Set<string>();
    allConversations.forEach((conv) => {
      conv.members?.forEach((m) => {
        if (m.user_id !== profile.id && m.profile?.id) {
          ids.add(m.profile.id);
        }
      });
    });
    return Array.from(ids);
  }, [allConversations, profile?.id]);

  const { data: onlineStatus = {} } = useUsersOnlineStatus(otherMemberIds);
  const { data: usersRoles = {} } = useUsersRoles(otherMemberIds);
  const { data: statusMap = new Map() } = useBatchUserStatuses(otherMemberIds);

  useEffect(() => {
    setRecentUsers(getRecentMessageUsers());
  }, []);




  const handleQuickAddSelect = useCallback(async (userId: string) => {
    if (!profile?.id) {
      toast.error("Please wait, loading your profile...");
      return;
    }
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [userId] });
      navigate(`/messages/${conversation.id}`);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to start conversation');
    }
  }, [profile?.id, createConversation, navigate]);

  // Filter conversations based on selected tab
  const filteredPinned = useMemo(() => {
    if (!pinnedConversations) return [];
    return pinnedConversations.filter(conv => {
      if (chatFilter === 'unread') return (conv.unread_count || 0) > 0;
      if (chatFilter === 'groups') return conv.is_group;
      if (chatFilter === 'streaks') {
        const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id : undefined;
        return otherMemberId ? (streakMap.get(otherMemberId)?.streak_count || 0) > 0 : false;
      }
      return true;
    });
  }, [pinnedConversations, chatFilter, profile?.id, streakMap]);

  const filteredUnpinned = useMemo(() => {
    if (!unpinnedConversations) return [];
    return unpinnedConversations.filter(conv => {
      if (chatFilter === 'unread') return (conv.unread_count || 0) > 0;
      if (chatFilter === 'groups') return conv.is_group;
      if (chatFilter === 'streaks') {
        const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id : undefined;
        return otherMemberId ? (streakMap.get(otherMemberId)?.streak_count || 0) > 0 : false;
      }
      return true;
    });
  }, [unpinnedConversations, chatFilter, profile?.id, streakMap]);

  const handleConversationClick = useCallback((convId: string) => {
    navigate(`/messages/${convId}`);
  }, [navigate]);

  const handleTrashConversation = useCallback((convId: string) => {
    trashConversation.mutate(convId);
  }, [trashConversation]);


  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
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
    );
  }

  const filterTabs = [
    { key: 'all' as const, label: 'All' },
    { key: 'unread' as const, label: 'Unread' },
    { key: 'groups' as const, label: 'Groups' },
    { key: 'streaks' as const, label: '🔥 Streaks' },
  ];

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      {/* Snapchat-style Header */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
          {/* Left: User Avatar */}
          <div className="flex items-center gap-1.5">
            {profile && (
              <button onClick={() => navigate(`/u/${profile.username}`)} className="flex-shrink-0">
                <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary/60 to-accent/60 text-primary-foreground">
                    {profile.username?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            )}
          </div>

          {/* Center: Title + Status */}
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-bold text-foreground tracking-tight">Chat</h1>
            <StatusPicker />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-0.5">
            <TrashBin 
              open={isTrashOpen} 
              onOpenChange={setIsTrashOpen}
              trigger={
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
            <Button size="icon" variant="ghost" onClick={() => setIsGroupDialogOpen(true)} className="h-8 w-8 rounded-full">
              <UsersRound className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => navigate('/messages/new')} className="h-8 w-8 rounded-full">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-full bg-muted/40 border-0 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
        </div>

        {/* Filter Tabs - Snapchat style horizontal pills */}
        <div className="px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {filterTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setChatFilter(tab.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  chatFilter === tab.key
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Create Group Dialog */}
      <CreateGroupDialog 
        open={isGroupDialogOpen}
        onOpenChange={setIsGroupDialogOpen}
        onSuccess={(conversationId) => {
          navigate(`/messages/${conversationId}`);
        }}
      />

      {/* Conversation List */}
      <ScrollArea className="flex-1" style={{ overflowX: 'hidden' }}>

        {/* Notes Row - Instagram/Snapchat style */}
        <NotesRow />

        {/* AI Chat Row */}
        <div className="px-3 pt-1 pb-1">
          <AutisyAIChatRow />
        </div>

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
        <div className="px-3 pb-4 space-y-0.5">
          {(filteredPinned.length > 0 || filteredUnpinned.length > 0) ? (
            <>
              {filteredPinned.map((conv) => {
                const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id : undefined;
                const hasStory = otherMemberId ? userStoryMap.has(otherMemberId) : false;
                const storyGroup = otherMemberId ? userStoryMap.get(otherMemberId) : undefined;
                const streak = otherMemberId ? streakMap.get(otherMemberId) : undefined;
                return (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    onClick={() => handleConversationClick(conv.id)}
                    isOnline={otherMemberId ? onlineStatus[otherMemberId] : false}
                    isTyping={checkTyping(conv.id)}
                    currentUserId={profile?.id}
                    userRole={otherMemberId ? usersRoles[otherMemberId] : null}
                    onTrash={() => handleTrashConversation(conv.id)}
                    hasStory={hasStory}
                    storyGroup={storyGroup}
                    streak={streak}
                    userStatus={otherMemberId ? statusMap.get(otherMemberId) : undefined}
                  />
                );
              })}
              {filteredUnpinned.map((conv) => {
                const otherMemberId = !conv.is_group ? conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id : undefined;
                const hasStory = otherMemberId ? userStoryMap.has(otherMemberId) : false;
                const storyGroup = otherMemberId ? userStoryMap.get(otherMemberId) : undefined;
                const streak = otherMemberId ? streakMap.get(otherMemberId) : undefined;
                return (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    onClick={() => handleConversationClick(conv.id)}
                    isOnline={otherMemberId ? onlineStatus[otherMemberId] : false}
                    isTyping={checkTyping(conv.id)}
                    currentUserId={profile?.id}
                    userRole={otherMemberId ? usersRoles[otherMemberId] : null}
                    onTrash={() => handleTrashConversation(conv.id)}
                    hasStory={hasStory}
                    storyGroup={storyGroup}
                    streak={streak}
                    userStatus={otherMemberId ? statusMap.get(otherMemberId) : undefined}
                  />
                );
              })}
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
          ) : !acceptedRequests?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-1">{t('messages.noConversations')}</h3>
              <p className="text-xs text-muted-foreground mb-5 max-w-[240px]">
                Add friends to start chatting. Your conversations will show up here.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => navigate('/messages/new')} className="rounded-full px-5 h-9 text-sm">
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  Find Friends
                </Button>
                <Button variant="outline" onClick={() => navigate('/search')} className="rounded-full px-4 h-9 text-sm">
                  Explore
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Recommended Friends - Snapchat Quick Add style */}
        {!searchQuery && chatFilter === 'all' && (
          <RecommendedFriendsSection />
        )}

        {/* Bottom padding */}
        {!searchQuery && chatFilter === 'all' && (
          <div className="pb-24" />
        )}
      </ScrollArea>

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
    </div>
  );
}

// Accepted Friend Request as Chat Row (inline notification style)
const AcceptedFriendChatRow = memo(function AcceptedFriendChatRow({
  request,
  onDismiss,
  onMessage,
}: {
  request: { id: string; sender?: { id: string; username: string; avatar_url: string | null; display_name: string | null } };
  onDismiss: () => void;
  onMessage: (userId: string) => void;
}) {
  const navigate = useNavigate();
  
  if (!request.sender) return null;
  
  const handleRowClick = () => {
    // Dismiss notification and start chat
    onDismiss();
    onMessage(request.sender!.id);
  };
  
  return (
    <div 
      className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 active:scale-[0.98] transition-all mb-0.5 cursor-pointer box-border border border-green-500/20"
      onClick={handleRowClick}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/u/${request.sender!.username}`);
        }}
        className="relative flex-shrink-0"
      >
        <Avatar className="h-12 w-12 ring-2 ring-green-500/30 shadow-md">
          <AvatarImage src={request.sender.avatar_url || undefined} />
          <AvatarFallback className="text-base">{request.sender.username?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
          <UserCheck className="h-2.5 w-2.5 text-white" />
        </div>
      </button>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <span className="font-semibold text-sm truncate flex-1 min-w-0">{request.sender.display_name || request.sender.username}</span>
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
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
  isTyping,
  currentUserId,
  userRole,
  hasStory,
  storyGroup,
  handleAvatarClick,
  otherMember,
  streak,
  userStatus,
}, _ref) {
  return (
    <>
      <div className="relative flex-shrink-0">
        {conversation.is_group ? (
          <div className="relative">
            <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} />
              ) : (
                <AvatarFallback className="text-base bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              )}
            </Avatar>
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center border-2 border-background">
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
                  <div className={`absolute inset-0 rounded-full ${storyGroup?.hasUnviewed ? 'bg-gradient-to-tr from-primary via-primary/80 to-primary/60' : 'bg-muted-foreground/30'}`} />
                )}
                <Avatar className={`h-full w-full ring-2 ring-background shadow-md ${hasStory ? 'relative' : ''}`}>
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-base">{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            </AvatarRing>
            <OnlineIndicator isOnline={isOnline} size="sm" className="absolute -bottom-0.5 -right-0.5" />
          </button>
        )}
        {isPinned && (
          <div className="absolute -top-1 -right-1 bg-primary rounded-full p-[3px] border-2 border-background shadow-sm">
            <Pin className="h-2.5 w-2.5 text-primary-foreground fill-primary-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {!conversation.is_group && otherMember ? (
              <StyledUsername
                userId={otherMember.id}
                username={otherMember.username || 'User'}
                displayName={otherMember.display_name}
                className="font-semibold text-sm truncate"
              />
            ) : (
              <span className="font-semibold text-sm truncate">{displayName}</span>
            )}
            {!conversation.is_group && userRole && <ModBadge role={userRole} />}
            {conversation.is_group && (
              <span className="text-[9px] text-muted-foreground bg-muted px-1 py-0.5 rounded-full flex-shrink-0">
                Group
              </span>
            )}
            {!conversation.is_group && otherMember && isOwner(otherMember.username || '') && <OwnerBadge />}
            {!conversation.is_group && otherMember && isOwnerWife(otherMember.id) && <OwnerWifeRingBadge />}
            {/* Streak indicator - Snapchat style */}
            {!conversation.is_group && streak && streak.streak_count > 0 && (
              <StreakIndicator 
                count={streak.streak_count} 
                expiresAt={streak.expires_at}
                size="sm"
              />
            )}
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {formattedTime && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formattedTime}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {isTyping ? (
              <div className="flex items-center gap-1.5 text-primary">
                <TypingIndicator size="sm" />
                <span className="text-xs font-medium">typing</span>
              </div>
            ) : lastMessage ? (
              <>
                {/* Snapchat-style status icons */}
                {lastMessage.sender_id === currentUserId ? (
                  // Sent messages: arrows
                  lastMessage.media_type === 'vybe' ? (
                    <span className="flex-shrink-0 text-red-500">▶</span>
                  ) : lastMessage.media_type === 'audio' ? (
                    <span className="flex-shrink-0 text-purple-500">▶</span>
                  ) : (
                    <span className="flex-shrink-0 text-primary">▶</span>
                  )
                ) : (
                  // Received messages: squares
                  lastMessage.media_type === 'vybe' ? (
                    <span className="flex-shrink-0 text-red-500">◼</span>
                  ) : lastMessage.media_type === 'audio' ? (
                    <span className="flex-shrink-0 text-purple-500">◼</span>
                  ) : (
                    <span className="flex-shrink-0 text-primary">◼</span>
                  )
                )}
                <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
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
                    ? 'Voice'
                    : lastMessage.media_type === 'gif'
                    ? 'GIF'
                    : lastMessage.content?.startsWith('e2ee:')
                    ? 'Chat'
                    : (lastMessage.content?.slice(0, 30) || 'Media') + (lastMessage.content && lastMessage.content.length > 30 ? '...' : '')}
                </p>
              </>
            ) : userStatus ? (
              <p className="text-xs text-muted-foreground/70 truncate italic">
                {userStatus.emoji} {userStatus.text}
              </p>
            ) : conversation.is_group ? (
              <p className="text-xs text-muted-foreground truncate">
                Start chatting
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {lastMessage &&
              lastMessage.media_type === 'vybe' &&
              lastMessage.sender_id !== currentUserId &&
              !lastMessage.viewed_at && (
                <span
                  className="flex items-center justify-center h-5 w-5 rounded-full bg-red-500/15 ring-1 ring-red-500/40"
                  aria-label="New Vybe Snap"
                  title="New Vybe Snap"
                >
                  <Camera className="h-3 w-3 text-red-500" />
                </span>
              )}
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm flex-shrink-0">
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
interface ConversationItemProps {
  conversation: Conversation; 
  onClick: () => void;
  isOnline?: boolean;
  isTyping?: boolean;
  currentUserId?: string;
  userRole?: 'admin' | 'moderator' | 'owner' | null;
  onTrash?: () => void;
  hasStory?: boolean;
  storyGroup?: StoryGroup;
  streak?: Streak;
  userStatus?: { emoji: string; text: string } | null;
}

const ConversationItem = memo(forwardRef<HTMLDivElement, ConversationItemProps>(function ConversationItem({ 
  conversation, 
  onClick,
  isOnline,
  isTyping,
  currentUserId,
  userRole,
  onTrash,
  hasStory,
  storyGroup,
  streak,
  userStatus,
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
    isDraggingRef.current = false;
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
  }, [onTrash]);

  const handleDragStart = useCallback(() => {
    isDraggingRef.current = true;
    // Cancel long press when dragging starts
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  
  // Long press handlers with scroll/movement detection
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
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
  }, []);

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
    if (!isLongPressRef.current && !isDraggingRef.current) {
      onClick();
    }
  }, [onClick]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);
  
  const otherMembers = useMemo(() => 
    conversation.members?.filter((m) => m.user_id !== currentUserId) || [],
    [conversation.members, currentUserId]
  );
  const otherMember = otherMembers[0]?.profile;
  
  const displayName = conversation.is_group
    ? conversation.name
    : otherMember?.display_name || otherMember?.username || 'Unknown';
  
  const avatarUrl = conversation.is_group
    ? conversation.avatar_url
    : otherMember?.avatar_url;
  
  const lastMessage = conversation.last_message;
  const unreadCount = conversation.unread_count || 0;
  const isPinned = conversation.members?.find((m) => m.user_id === currentUserId)?.is_pinned;
  const memberCount = conversation.is_group ? (conversation.members?.length || 0) : 0;

  const formattedTime = useMemo(() => {
    if (!lastMessage?.created_at) return null;
    return compactTime(lastMessage.created_at);
  }, [lastMessage?.created_at]);

  const isMuted = conversation.members?.find((m) => m.user_id === currentUserId)?.is_muted;

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!conversation.is_group && otherMember) {
      if (hasStory && storyGroup) {
        navigate(`/stories/${otherMember.username}`);
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
    isTyping,
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
        <div className="relative mb-1.5">
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
            className="relative rounded-2xl overflow-hidden"
            style={{ x }}
            drag="x"
            dragConstraints={{ left: -120, right: 0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            animate={isDeleting ? { x: -400, opacity: 0, height: 0, marginBottom: 0 } : { x: 0 }}
            transition={isDeleting ? { duration: 0.35, ease: [0.4, 0, 0.2, 1] } : { type: 'spring', stiffness: 400, damping: 35 }}
          >
            <div 
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 active:scale-[0.98] transition-all cursor-pointer box-border"
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
        className="group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/40 active:scale-[0.98] transition-all mb-0.5 cursor-pointer box-border"
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
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Quick Add</span>
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
