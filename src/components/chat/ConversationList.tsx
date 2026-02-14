import { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TypingIndicator } from '@/components/ui/TypingIndicator';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus, Bot, UsersRound, Trash2, Nfc, X, UserCheck, Flame } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { QuickAddRow } from './QuickAddRow';
import { MutualFriendsQuickAdd } from './MutualFriendsQuickAdd';
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
import { NFCFriendShare } from '@/components/friends/NFCFriendShare';

const AutisyAIChatRow = memo(function AutisyAIChatRow() {
  const navigate = useNavigate();

  // Get AI name from localStorage
  const aiName = useMemo(() => {
    try {
      const stored = localStorage.getItem('vybe_ai_profile');
      if (stored) {
        const profile = JSON.parse(stored);
        return profile.name || 'Morgan';
      }
    } catch {}
    return 'Morgan';
  }, []);

  // Get last AI message from localStorage for preview
  const lastAIMessage = useMemo(() => {
    try {
      const stored = localStorage.getItem('vybe_ai_chat_messages');
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
      onClick={() => navigate('/messages/ai-autisy')}
      className="w-full flex items-center gap-3 p-3 rounded-2xl text-left liquid-glass hover:bg-white/10 dark:hover:bg-white/5 active:scale-[0.98] transition-all border border-white/10 hover:border-white/20 mb-2 box-border shadow-sm"
    >
      <div className="relative flex-shrink-0">
        <div className="h-12 w-12 rounded-full gradient-animated flex items-center justify-center shadow-md">
          <Bot className="h-6 w-6 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5 gap-2">
          <span className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
            <span className="truncate">{aiName}</span>
            <VybeMiniIcon size={14} showSparkles className="flex-shrink-0" />
          </span>
          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-primary/10 rounded-full flex-shrink-0">AI</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{lastAIMessage.slice(0, 40)}...</p>
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
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
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

  useEffect(() => {
    setRecentUsers(getRecentMessageUsers());
  }, []);

  // Convert online friends to the format needed for QuickAddRow
  const onlineFriendsForQuickAdd = useMemo(() => 
    onlineFriends
      .filter(f => f.id !== profile?.id)
      .map(f => ({
        id: f.id,
        username: f.username,
        avatar_url: f.avatar_url,
        display_name: f.display_name,
        isOnline: true,
      })),
    [onlineFriends, profile?.id]
  );

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

  // pinnedConversations and unpinnedConversations already provided by useDMConversations hook

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

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{t('messages.title')}</h1>
          <div className="flex items-center gap-1">
            {/* Trash Bin Button */}
            <TrashBin 
              open={isTrashOpen} 
              onOpenChange={setIsTrashOpen}
              trigger={
                <Button 
                  size="icon" 
                  variant="ghost"
                  className="h-9 w-9"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              }
            />
            {/* Create Group Button */}
            <Button 
              size="icon" 
              variant="ghost"
              onClick={() => setIsGroupDialogOpen(true)}
              className="h-9 w-9"
            >
              <UsersRound className="h-5 w-5" />
            </Button>
            {/* New 1:1 Chat */}
            <NewChatDialog 
              open={isNewChatOpen} 
              onOpenChange={setIsNewChatOpen}
              onSelectUser={handleQuickAddSelect}
            />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('messages.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
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

      {/* Quick Add Section - Online Friends */}
      {!searchQuery && (recentUsers.length > 0 || onlineFriendsForQuickAdd.length > 0) && (
        <div className="px-4 pt-2 space-y-3 flex-shrink-0 overflow-hidden">
          {recentUsers.length > 0 && (
            <QuickAddRow
              title="Recent"
              users={recentUsers.slice(0, 8)}
              onSelect={handleQuickAddSelect}
            />
          )}
          {onlineFriendsForQuickAdd.length > 0 && (
            <QuickAddRow
              title={`Online Friends (${onlineCount})`}
              users={onlineFriendsForQuickAdd.slice(0, 8)}
              onSelect={handleQuickAddSelect}
              showOnlineIndicator
            />
          )}
        </div>
      )}

      {/* Conversation List */}
      <ScrollArea className="flex-1" style={{ overflowX: 'hidden' }}>
        <div className="p-3 pb-2 space-y-1 w-full box-border">
          <p className="text-xs font-medium text-foreground/80 px-3 py-2 flex items-center gap-1.5 uppercase tracking-wide">
            <Users className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Friends & AI</span>
          </p>
          <AutisyAIChatRow />
        </div>

        <div className="p-3 pb-24 space-y-1 w-full box-border">
          {/* Accepted Friend Requests as Chat Notifications */}
          {acceptedRequests && acceptedRequests.length > 0 && (
            <>
              {acceptedRequests.map((request) => (
                <AcceptedFriendChatRow 
                  key={request.id}
                  request={request}
                  onDismiss={() => dismissAccepted.mutate(request.id)}
                  onMessage={handleQuickAddSelect}
                />
              ))}
            </>
          )}
          
         {(pinnedConversations.length > 0 || unpinnedConversations.length > 0) ? (
            <>
              <p className="text-xs font-medium text-foreground/80 px-3 py-2 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">All Messages</span>
              </p>
             {/* Pinned conversations at the top */}
             {pinnedConversations.map((conv) => {
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
                 />
               );
             })}
             {/* Unpinned conversations below */}
              {unpinnedConversations.map((conv) => {
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
                  />
                );
              })}
            </>
          ) : searchQuery ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1">No conversations found</h3>
              <p className="text-muted-foreground text-sm">
                No results for "{searchQuery}"
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear search
              </Button>
            </div>
          ) : !acceptedRequests?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                <MessageCircle className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t('messages.noConversations')}</h3>
              <p className="text-muted-foreground mb-6 text-sm">{t('messages.startChatting')}</p>
              <Button onClick={() => setIsNewChatOpen(true)} size="lg" className="rounded-full px-6">
                <Plus className="h-4 w-4 mr-2" />
                {t('messages.newChat')}
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>
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
      className="group relative w-full flex items-center gap-3 p-3 rounded-2xl text-left liquid-glass hover:bg-white/10 dark:hover:bg-white/5 active:scale-[0.98] transition-all border border-green-500/30 mb-2 cursor-pointer box-border shadow-sm"
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
const ConversationContent = memo(function ConversationContent({
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
}: any) {
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
          <button onClick={handleAvatarClick} className="block">
            <div className={`relative ${hasStory ? 'p-0.5' : ''}`}>
              {hasStory && (
                <div className={`absolute inset-0 rounded-full ${storyGroup?.hasUnviewed ? 'bg-gradient-to-tr from-primary via-primary/80 to-primary/60' : 'bg-muted-foreground/30'}`} />
              )}
              <Avatar className={`h-12 w-12 ring-2 ring-background shadow-md ${hasStory ? 'relative' : ''}`}>
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback className="text-base">{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <OnlineIndicator isOnline={isOnline} size="sm" className="-bottom-0.5 -right-0.5" />
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
                {formattedTime.replace(' ago', '').replace('about ', '').replace('less than a minute', '1m')}
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
                {lastMessage.sender_id === currentUserId && (
                  <span className="flex-shrink-0">
                    {unreadCount === 0 ? (
                      <CheckCheck className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </span>
                )}
                <p className="text-xs text-muted-foreground truncate flex-1 min-w-0">
                  {lastMessage.media_type === 'vybe' 
                    ? '🌟 VYBE'
                    : lastMessage.media_type === 'image' 
                    ? '📷 Photo' 
                    : lastMessage.media_type === 'video'
                    ? '📹 Video'
                    : lastMessage.media_type === 'audio'
                    ? '🎤 Voice'
                    : lastMessage.media_type === 'gif'
                    ? '🎞️ GIF'
                    : (lastMessage.content?.slice(0, 30) || 'Media') + (lastMessage.content && lastMessage.content.length > 30 ? '...' : '')}
                </p>
              </>
            ) : conversation.is_group ? (
              <p className="text-xs text-muted-foreground truncate">
                Start chatting
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
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
});

// Memoized conversation item with swipe-to-delete on mobile and long-press for options
const ConversationItem = memo(function ConversationItem({ 
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
}: { 
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
}) {
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
  
  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    isDraggingRef.current = false;
    if (info.offset.x < SWIPE_THRESHOLD && onTrash) {
      setIsDeleting(true);
      setTimeout(() => {
        onTrash();
      }, 200);
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
    
    // If moved more than 10px in any direction, cancel long press (scrolling detected)
    if (dx > 10 || dy > 10) {
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
    return formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true });
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
  };

  // Mobile swipeable version with long-press for options
  if (isMobile && onTrash) {
    return (
      <>
        <div className="relative mb-1.5">
          {/* Delete indicator - hidden at rest, slowly reveals behind frosted glass on swipe */}
          <motion.div 
            className="absolute inset-0 flex items-center justify-end"
            style={{ 
              opacity: deleteBgOpacity,
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
            animate={isDeleting ? { x: -400, opacity: 0 } : { x: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          >
            <div 
              className="group w-full flex items-center gap-3 p-3 rounded-2xl text-left liquid-glass hover:bg-white/10 dark:hover:bg-white/5 active:scale-[0.98] transition-all border border-white/10 hover:border-white/20 cursor-pointer box-border shadow-sm"
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
        className="group relative w-full flex items-center gap-3 p-3 rounded-2xl text-left liquid-glass hover:bg-white/10 dark:hover:bg-white/5 active:scale-[0.98] transition-all border border-white/10 hover:border-white/20 mb-2 cursor-pointer box-border shadow-sm"
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
});

// New Chat Dialog - now includes NFC option and links to Add Friends page
function NewChatDialog({ 
  open, 
  onOpenChange,
  onSelectUser,
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  onSelectUser: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['user-search', searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .neq('id', profile?.id || '')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(20);
      
      if (error) throw error;
      return data || [];
    },
    enabled: searchQuery.length >= 2,
    staleTime: 30000,
  });

  const handleSelect = useCallback((userId: string) => {
    onSelectUser(userId);
    onOpenChange(false);
    setSearchQuery('');
  }, [onSelectUser, onOpenChange]);

  const handleGoToAddFriends = () => {
    onOpenChange(false);
    navigate('/messages/new');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Friends
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* NFC Quick Add Banner */}
          <div className="rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Nfc className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Quick Add with NFC</p>
              <p className="text-xs text-muted-foreground">Tap phones to add friends</p>
            </div>
            <NFCFriendShare variant="icon" />
          </div>

          <MutualFriendsQuickAdd onSelect={handleSelect} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
