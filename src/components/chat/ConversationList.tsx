import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useRealtimeConversations } from '@/hooks/useRealtimeMessages';
import { useOnlineFriends } from '@/hooks/useOnlineFriends';
import { useAuth } from '@/lib/auth';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus, Sparkles, Bot, UsersRound, Circle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { QuickAddRow } from './QuickAddRow';
import { MutualFriendsQuickAdd } from './MutualFriendsQuickAdd';
import { CreateGroupDialog } from './CreateGroupDialog';
import { getRecentMessageUsers, type RecentMessageUser } from '@/lib/recentMessageUsers';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { PrincessBadge, isOwnerWife } from '@/components/ui/PrincessBadge';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';

const AutisyAIChatRow = memo(function AutisyAIChatRow() {
  const navigate = useNavigate();

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
    return "Tap to chat with me! 🦆";
  }, []);

  return (
    <button
      onClick={() => navigate('/messages/ai-autisy')}
      className="w-full flex items-center gap-4 p-4 rounded-2xl text-left hover:bg-accent/50 active:scale-[0.98] transition-all border border-transparent hover:border-border/50 mb-2"
    >
      <div className="relative flex-shrink-0">
        <div className="h-14 w-14 rounded-full gradient-animated flex items-center justify-center shadow-md">
          <Bot className="h-7 w-7 text-white" />
        </div>
        <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
      </div>
      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-base flex items-center gap-1.5">
            Autisy
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-primary/10 rounded-full">AI</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{lastAIMessage.slice(0, 50)}...</p>
      </div>
    </button>
  );
});

export function ConversationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  // Enable instant realtime updates for conversations
  useRealtimeConversations();
  const { onlineFriends, onlineCount } = useOnlineFriends();
  const createConversation = useCreateConversation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [recentUsers, setRecentUsers] = useState<RecentMessageUser[]>([]);
  

  // Get user IDs for online status check - memoized
  const otherMemberIds = useMemo(() => {
    if (!conversations || !profile?.id) return [];
    const ids = new Set<string>();
    conversations.forEach((conv) => {
      conv.members?.forEach((m) => {
        if (m.user_id !== profile.id && m.profile?.id) {
          ids.add(m.profile.id);
        }
      });
    });
    return Array.from(ids);
  }, [conversations, profile?.id]);

  const { data: onlineStatus = {} } = useUsersOnlineStatus(otherMemberIds);

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

  const { pinnedConversations, unpinnedConversations } = useMemo(() => {
    const filtered = conversations?.filter((conv) => {
      const otherMembers = conv.members?.filter((m) => m.user_id !== profile?.id) || [];
      const name = conv.is_group 
        ? conv.name 
        : otherMembers[0]?.profile?.display_name || otherMembers[0]?.profile?.username;
      return name?.toLowerCase().includes(searchQuery.toLowerCase());
    }) || [];

    return {
      pinnedConversations: filtered.filter(
        (c) => c.members?.find((m) => m.user_id === profile?.id)?.is_pinned
      ),
      unpinnedConversations: filtered.filter(
        (c) => !c.members?.find((m) => m.user_id === profile?.id)?.is_pinned
      ),
    };
  }, [conversations, profile?.id, searchQuery]);

  const handleConversationClick = useCallback((convId: string) => {
    navigate(`/messages/${convId}`);
  }, [navigate]);


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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t('messages.title')}</h1>
          <div className="flex items-center gap-1">
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
        <div className="px-4 pt-2 space-y-3">
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
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-3 py-2 flex items-center gap-1.5 uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" />
            Friends & AI
          </p>
          <AutisyAIChatRow />
        </div>

        {pinnedConversations.length > 0 && (
          <div className="p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-3 py-2 flex items-center gap-1.5 uppercase tracking-wide">
              <Pin className="h-3.5 w-3.5" />
              {t('messages.pinned')}
            </p>
            {pinnedConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                onClick={() => handleConversationClick(conv.id)}
                isOnline={!conv.is_group && conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id 
                  ? onlineStatus[conv.members.find(m => m.user_id !== profile?.id)?.profile?.id || ''] 
                  : false}
                currentUserId={profile?.id}
              />
            ))}
          </div>
        )}

        <div className="p-3 space-y-1">
          {unpinnedConversations.length > 0 ? (
            <>
              <p className="text-xs font-medium text-muted-foreground px-3 py-2 flex items-center gap-1.5 uppercase tracking-wide">
                <MessageCircle className="h-3.5 w-3.5" />
                All Messages
              </p>
              {unpinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onClick={() => handleConversationClick(conv.id)}
                  isOnline={!conv.is_group && conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id 
                    ? onlineStatus[conv.members.find(m => m.user_id !== profile?.id)?.profile?.id || ''] 
                    : false}
                  currentUserId={profile?.id}
                />
              ))}
            </>
          ) : (
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
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Memoized conversation item
const ConversationItem = memo(function ConversationItem({ 
  conversation, 
  onClick,
  isOnline,
  currentUserId,
}: { 
  conversation: Conversation; 
  onClick: () => void;
  isOnline?: boolean;
  currentUserId?: string;
}) {
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
  
  // Get member count for groups
  const memberCount = conversation.is_group ? (conversation.members?.length || 0) : 0;

  const formattedTime = useMemo(() => {
    if (!lastMessage?.created_at) return null;
    return formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true });
  }, [lastMessage?.created_at]);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-2xl text-left hover:bg-accent/50 active:scale-[0.98] transition-all border border-transparent hover:border-border/50 mb-2"
    >
      <div className="relative flex-shrink-0">
        {conversation.is_group ? (
          // Group chat avatar with member count badge
          <div className="relative">
            <Avatar className="h-14 w-14 ring-2 ring-background shadow-md">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} />
              ) : (
                <AvatarFallback className="text-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
                  <Users className="h-6 w-6" />
                </AvatarFallback>
              )}
            </Avatar>
            {/* Member count badge */}
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center border-2 border-background">
              {memberCount}
            </div>
          </div>
        ) : (
          // DM avatar with online status
          <>
            <Avatar className="h-14 w-14 ring-2 ring-background shadow-md">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-lg">{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <OnlineIndicator isOnline={isOnline} size="sm" className="bottom-0 right-0" />
          </>
        )}
        {isPinned && (
          <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
            <Pin className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 py-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold text-base truncate">{displayName}</span>
            {conversation.is_group && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full flex-shrink-0">
                Group
              </span>
            )}
            {!conversation.is_group && otherMember && isOwner(otherMember.username || '') && <OwnerBadge />}
            {!conversation.is_group && otherMember && isOwnerWife(otherMember.id) && <PrincessBadge />}
          </div>
          {formattedTime && (
            <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">{formattedTime}</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {lastMessage && (
              <>
                {lastMessage.sender_id === currentUserId && (
                  <span className="flex-shrink-0">
                    {unreadCount === 0 ? (
                      <CheckCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Check className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                )}
                <p className="text-sm text-muted-foreground truncate">
                  {lastMessage.media_type === 'image' 
                    ? '📷 Photo' 
                    : lastMessage.media_type === 'audio'
                    ? '🎤 Voice message'
                    : lastMessage.content || 'Message'}
                </p>
              </>
            )}
            {!lastMessage && conversation.is_group && (
              <p className="text-sm text-muted-foreground truncate">
                Start chatting with the group
              </p>
            )}
          </div>

          {unreadCount > 0 && (
            <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-full ml-2 shadow-sm">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// New Chat Dialog
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
            {t('messages.newChat')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          <MutualFriendsQuickAdd onSelect={handleSelect} />

          <ScrollArea className="max-h-64">
            {isSearching ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            ) : searchResults && searchResults.length > 0 ? (
              <div className="space-y-1">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelect(user.id)}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>{user.username?.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="font-medium">{user.display_name || user.username}</p>
                      {user.display_name && (
                        <p className="text-sm text-muted-foreground">@{user.username}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : searchQuery.length >= 2 ? (
              <p className="text-center text-muted-foreground py-4">No users found</p>
            ) : (
              <p className="text-center text-muted-foreground py-4">Type to search for users</p>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
