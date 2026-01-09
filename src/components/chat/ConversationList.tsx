import { useState, useEffect, useMemo, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useFriends } from '@/hooks/useFriends';
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
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus, Sparkles, Bot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { QuickAddRow } from './QuickAddRow';
import { MutualFriendsQuickAdd } from './MutualFriendsQuickAdd';
import { getRecentMessageUsers, type RecentMessageUser } from '@/lib/recentMessageUsers';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OnlineIndicator } from '@/components/ui/OnlineIndicator';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';

// Autisy AI chat component
const AutisyAIChatRow = memo(function AutisyAIChatRow() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "YOOO what's up bestie!! 🎪✨ I'm Autisy, your chaotic AI companion! Ask me ANYTHING 🦆💀" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = { role: 'user' as const, content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    let assistantContent = '';
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages: [...messages, userMessage] }),
        }
      );

      if (!response.ok) throw new Error('Failed');
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No reader');

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: "Oops something broke 💀 try again bestie!" }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const lastAIMessage = useMemo(() => 
    messages.filter(m => m.role === 'assistant').pop()?.content || "Tap to chat with me! 🦆",
    [messages]
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-accent/50 transition-colors"
      >
        <div className="relative flex-shrink-0">
          <div className="h-12 w-12 rounded-full gradient-animated flex items-center justify-center">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Autisy</span>
            <span className="text-xs text-muted-foreground">AI</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">{lastAIMessage.slice(0, 40)}...</p>
        </div>
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen} modal>
        <DialogContent 
          className="sm:max-w-md max-h-[80vh] flex flex-col p-0" 
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full gradient-animated flex items-center justify-center">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="gradient-text font-bold">Autisy</span>
                <p className="text-xs text-muted-foreground font-normal">Chaotic AI bestie 🦆</p>
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 p-4 max-h-80">
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full gradient-animated flex-shrink-0 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'
                  }`}>
                    {msg.content || 'Thinking... 🧠'}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-4 border-t border-border flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask Autisy anything..."
              disabled={isLoading}
              className="flex-1"
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim() || isLoading}>
              {isLoading ? <Sparkles className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

export function ConversationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  const { data: friends } = useFriends();
  const createConversation = useCreateConversation();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
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

  const friendsForQuickAdd = useMemo<RecentMessageUser[]>(() => 
    (friends || [])
      .filter((f): f is NonNullable<typeof f> => f !== null && f.id !== profile?.id)
      .map(f => ({
        id: f.id,
        username: f.username,
        avatar_url: f.avatar_url,
        display_name: f.display_name,
      })),
    [friends, profile?.id]
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{t('messages.title')}</h1>
          <NewChatDialog 
            open={isNewChatOpen} 
            onOpenChange={setIsNewChatOpen}
            onSelectUser={handleQuickAddSelect}
          />
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

      {/* Quick Add Section */}
      {!searchQuery && (recentUsers.length > 0 || friendsForQuickAdd.length > 0) && (
        <div className="px-4 pt-2 space-y-3">
          {recentUsers.length > 0 && (
            <QuickAddRow
              title="Recent"
              users={recentUsers.slice(0, 8)}
              onSelect={handleQuickAddSelect}
            />
          )}
          {friendsForQuickAdd.length > 0 && (
            <QuickAddRow
              title="Friends"
              users={friendsForQuickAdd.slice(0, 8)}
              onSelect={handleQuickAddSelect}
            />
          )}
        </div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <p className="text-xs text-muted-foreground px-2 mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" />
            Friends & AI
          </p>
          <AutisyAIChatRow />
        </div>

        {pinnedConversations.length > 0 && (
          <div className="p-2">
            <p className="text-xs text-muted-foreground px-2 mb-2 flex items-center gap-1">
              <Pin className="h-3 w-3" />
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

        <div className="p-2">
          {unpinnedConversations.length > 0 ? (
            unpinnedConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                onClick={() => handleConversationClick(conv.id)}
                isOnline={!conv.is_group && conv.members?.find(m => m.user_id !== profile?.id)?.profile?.id 
                  ? onlineStatus[conv.members.find(m => m.user_id !== profile?.id)?.profile?.id || ''] 
                  : false}
                currentUserId={profile?.id}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('messages.noConversations')}</h3>
              <p className="text-muted-foreground mb-4">{t('messages.startChatting')}</p>
              <Button onClick={() => setIsNewChatOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('messages.newChat')}
              </Button>
            </div>
          )}
        </div>
      </div>
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

  const formattedTime = useMemo(() => {
    if (!lastMessage?.created_at) return null;
    return formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true });
  }, [lastMessage?.created_at]);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-accent/50 transition-colors"
    >
      <div className="relative flex-shrink-0">
        <Avatar className="h-12 w-12 ring-2 ring-background">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback>{displayName?.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        {!conversation.is_group && (
          <OnlineIndicator isOnline={isOnline} size="sm" className="bottom-0 right-0" />
        )}
        {isPinned && (
          <div className="absolute -top-1 -right-1 bg-primary rounded-full p-0.5">
            <Pin className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-semibold truncate">{displayName}</span>
            {otherMember && isOwner(otherMember.id) && <OwnerBadge />}
          </div>
          {formattedTime && (
            <span className="text-xs text-muted-foreground flex-shrink-0">{formattedTime}</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {lastMessage && (
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
                <p className="text-sm text-muted-foreground truncate">
                  {lastMessage.media_type === 'image' 
                    ? '📷 Photo' 
                    : lastMessage.media_type === 'audio'
                    ? '🎤 Voice message'
                    : lastMessage.content || 'Message'}
                </p>
              </>
            )}
          </div>

          {unreadCount > 0 && (
            <span className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full ml-2">
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
