import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversations, useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export function ConversationList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: conversations, isLoading } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);

  const filteredConversations = conversations?.filter((conv) => {
    const otherMembers = conv.members?.filter((m) => m.user_id !== profile?.id) || [];
    const name = conv.is_group 
      ? conv.name 
      : otherMembers[0]?.profile?.display_name || otherMembers[0]?.profile?.username;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const pinnedConversations = filteredConversations?.filter(
    (c) => c.members?.find((m) => m.user_id === profile?.id)?.is_pinned
  );
  const unpinnedConversations = filteredConversations?.filter(
    (c) => !c.members?.find((m) => m.user_id === profile?.id)?.is_pinned
  );

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
          <NewChatDialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen} />
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

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {pinnedConversations && pinnedConversations.length > 0 && (
          <div className="p-2">
            <p className="text-xs text-muted-foreground px-2 mb-2 flex items-center gap-1">
              <Pin className="h-3 w-3" />
              {t('messages.pinned')}
            </p>
            <AnimatePresence>
              {pinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onClick={() => navigate(`/messages/${conv.id}`)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <div className="p-2">
          {unpinnedConversations && unpinnedConversations.length > 0 ? (
            <AnimatePresence>
              {unpinnedConversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  onClick={() => navigate(`/messages/${conv.id}`)}
                />
              ))}
            </AnimatePresence>
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

function ConversationItem({ 
  conversation, 
  onClick 
}: { 
  conversation: Conversation; 
  onClick: () => void;
}) {
  const { profile } = useAuth();
  const otherMembers = conversation.members?.filter((m) => m.user_id !== profile?.id) || [];
  const otherMember = otherMembers[0]?.profile;
  
  const displayName = conversation.is_group
    ? conversation.name
    : otherMember?.display_name || otherMember?.username || 'Unknown';

  const avatarUrl = conversation.is_group
    ? conversation.avatar_url
    : otherMember?.avatar_url;

  const lastMessage = conversation.last_message;
  const isOwnMessage = lastMessage?.sender_id === profile?.id;
  const hasUnread = (conversation.unread_count || 0) > 0;

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ backgroundColor: 'hsl(var(--accent))' }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
    >
      <div className="relative">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {displayName?.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {hasUnread && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-bold">
            {conversation.unread_count}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${hasUnread ? 'text-foreground' : 'text-foreground'}`}>
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
          {isOwnMessage && (
            lastMessage?.views?.length ? (
              <CheckCheck className="h-3 w-3 text-primary flex-shrink-0" />
            ) : (
              <Check className="h-3 w-3 flex-shrink-0" />
            )
          )}
          <span className={`truncate ${hasUnread ? 'font-medium text-foreground' : ''}`}>
            {lastMessage?.view_mode === 'view_once' && !isOwnMessage
              ? '📷 Photo'
              : lastMessage?.content || (lastMessage?.media_url ? '📷 Media' : 'Tap to chat')}
          </span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex-shrink-0">
        {lastMessage?.created_at && formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: false })}
      </div>
    </motion.button>
  );
}

function NewChatDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const createConversation = useCreateConversation();
  const { data: friends, isLoading: friendsLoading } = useFriends();

  // Reset search when dialog opens
  useEffect(() => {
    if (open) setSearchQuery('');
  }, [open]);

  // Search for users when typing
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['search-users-chat', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];

      const { data: authUser } = await supabase.auth.getUser();
      if (!authUser.user) return [];

      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .neq('user_id', authUser.user.id)
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(20);

      return data || [];
    },
    enabled: searchQuery.length >= 1,
  });

  const handleSelectUser = async (userId: string) => {
    if (!profile?.id) {
      toast.error("Please wait, loading your profile...");
      return;
    }
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [userId],
      });
      onOpenChange(false);
      setSearchQuery('');
      navigate(`/messages/${conversation.id}`);
    } catch (error: any) {
      console.error('Failed to create conversation:', error);
      toast.error(error?.message || 'Failed to start conversation');
    }
  };

  // Show search results if searching, otherwise show friends
  const displayUsers = searchQuery.trim() 
    ? searchResults 
    : friends?.filter((f): f is NonNullable<typeof f> => f !== null && f !== undefined);

  const isLoading = searchQuery.trim() ? searchLoading : friendsLoading;
  const showingFriends = !searchQuery.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Plus className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('messages.newChat')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          
          {showingFriends && friends && friends.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
              <Users className="h-3 w-3" />
              <span>Your Friends</span>
            </div>
          )}

          <div className="max-h-80 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayUsers && displayUsers.length > 0 ? (
              displayUsers.map((user) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => handleSelectUser(user.id)}
                  disabled={createConversation.isPending}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {user.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-medium truncate">{user.display_name || user.username}</p>
                    <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
                  </div>
                  {showingFriends && (
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
                      Friend
                    </span>
                  )}
                </motion.button>
              ))
            ) : searchQuery ? (
              <div className="text-center py-8">
                <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No users found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different username</p>
              </div>
            ) : friends && friends.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No friends yet</p>
                <p className="text-xs text-muted-foreground mt-1">Search for users to start chatting</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Search for someone</p>
                <p className="text-xs text-muted-foreground mt-1">Type a username to find people</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
