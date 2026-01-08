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
import { MessageCircle, Plus, Search, Pin, Check, CheckCheck, Users, UserPlus, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { QuickAddRow } from './QuickAddRow';
import { MutualFriendsQuickAdd } from './MutualFriendsQuickAdd';
import { getRecentMessageUsers, type RecentMessageUser } from '@/lib/recentMessageUsers';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';

const listItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: i * 0.03,
      type: 'spring' as const,
      stiffness: 400,
      damping: 25,
    },
  }),
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

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

  // Load recent message users
  useEffect(() => {
    setRecentUsers(getRecentMessageUsers());
  }, []);

  // Convert friends to RecentMessageUser format, excluding already chatted users
  const friendsForQuickAdd: RecentMessageUser[] = (friends || [])
    .filter((f): f is NonNullable<typeof f> => f !== null && f.id !== profile?.id)
    .map(f => ({
      id: f.id,
      username: f.username,
      avatar_url: f.avatar_url,
      display_name: f.display_name,
    }));

  const handleQuickAddSelect = async (userId: string) => {
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
  };

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
          <motion.div 
            key={i} 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3"
          >
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with animation */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="p-4 border-b border-border"
      >
        <div className="flex items-center justify-between mb-4">
          <motion.h1 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="text-2xl font-bold"
          >
            {t('messages.title')}
          </motion.h1>
          <NewChatDialog 
            open={isNewChatOpen} 
            onOpenChange={setIsNewChatOpen}
            onSelectUser={handleQuickAddSelect}
          />
        </div>
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('messages.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 transition-all focus:ring-2 focus:ring-primary/20"
          />
        </motion.div>
      </motion.div>

      {/* Quick Add Section with stagger animation */}
      {!searchQuery && (recentUsers.length > 0 || friendsForQuickAdd.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="px-4 pt-2 space-y-3"
        >
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
        </motion.div>
      )}

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {pinnedConversations && pinnedConversations.length > 0 && (
          <div className="p-2">
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground px-2 mb-2 flex items-center gap-1"
            >
              <Pin className="h-3 w-3" />
              {t('messages.pinned')}
            </motion.p>
            <AnimatePresence>
              {pinnedConversations.map((conv, i) => (
                <motion.div
                  key={conv.id}
                  custom={i}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <ConversationItem
                    conversation={conv}
                    onClick={() => navigate(`/messages/${conv.id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <div className="p-2">
          {unpinnedConversations && unpinnedConversations.length > 0 ? (
            <AnimatePresence>
              {unpinnedConversations.map((conv, i) => (
                <motion.div
                  key={conv.id}
                  custom={i}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <ConversationItem
                    conversation={conv}
                    onClick={() => navigate(`/messages/${conv.id}`)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <motion.div
                animate={{ 
                  rotate: [0, 10, -10, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ repeat: Infinity, duration: 3 }}
              >
                <MessageCircle className="h-16 w-16 text-muted-foreground mb-4" />
              </motion.div>
              <h3 className="text-lg font-medium mb-2">{t('messages.noConversations')}</h3>
              <p className="text-muted-foreground mb-4">{t('messages.startChatting')}</p>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button onClick={() => setIsNewChatOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('messages.newChat')}
                </Button>
              </motion.div>
            </motion.div>
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
      whileHover={{ 
        scale: 1.02, 
        backgroundColor: 'hsl(var(--accent))',
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
    >
      <motion.div 
        className="relative"
        whileHover={{ rotate: [0, -5, 5, 0] }}
        transition={{ duration: 0.3 }}
      >
        <Avatar className="h-12 w-12 ring-2 ring-background shadow-sm">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-bold">
            {displayName?.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <AnimatePresence>
          {hasUnread && (
            <motion.span 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 500 }}
              className="absolute -top-1 -right-1 h-5 w-5 bg-primary rounded-full flex items-center justify-center text-xs text-primary-foreground font-bold shadow-md"
            >
              {conversation.unread_count}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${hasUnread ? 'text-foreground' : 'text-foreground'}`}>
            {displayName}
          </span>
          {!conversation.is_group && isOwner(otherMember?.username) && <OwnerBadge />}
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
          {isOwnMessage && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              {lastMessage?.views?.length ? (
                <CheckCheck className="h-3 w-3 text-primary flex-shrink-0" />
              ) : (
                <Check className="h-3 w-3 flex-shrink-0" />
              )}
            </motion.div>
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
        <motion.div whileHover={{ scale: 1.1, rotate: 90 }} whileTap={{ scale: 0.9 }}>
          <Button size="icon" variant="ghost">
            <Plus className="h-5 w-5" />
          </Button>
        </motion.div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary animate-pulse" />
            {t('messages.newChat')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </motion.div>
          
          {/* Mutual Friends Quick Add - only show when not searching */}
          {!searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <MutualFriendsQuickAdd onSelect={(userId) => {
                handleSelectUser(userId);
              }} />
            </motion.div>
          )}
          
          {showingFriends && friends && friends.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-xs text-muted-foreground px-1"
            >
              <Users className="h-3 w-3" />
              <span>Your Friends</span>
            </motion.div>
          )}

          <div className="max-h-80 overflow-y-auto space-y-1">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 p-3"
                  >
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : displayUsers && displayUsers.length > 0 ? (
              <AnimatePresence>
                {displayUsers.map((user, i) => (
                  <motion.button
                    key={user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    whileHover={{ scale: 1.02, backgroundColor: 'hsl(var(--accent))' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectUser(user.id)}
                    disabled={createConversation.isPending}
                    className="w-full flex items-center gap-3 p-3 rounded-xl transition-colors disabled:opacity-50"
                  >
                    <motion.div
                      whileHover={{ rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 0.3 }}
                    >
                      <Avatar className="h-10 w-10 ring-2 ring-background shadow-sm">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                          {user.username?.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </motion.div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-medium truncate">{user.display_name || user.username}</p>
                      <p className="text-sm text-muted-foreground truncate">@{user.username}</p>
                    </div>
                    {showingFriends && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full"
                      >
                        Friend
                      </motion.span>
                    )}
                  </motion.button>
                ))}
              </AnimatePresence>
            ) : searchQuery ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                </motion.div>
                <p className="text-muted-foreground">No users found</p>
                <p className="text-xs text-muted-foreground mt-1">Try a different username</p>
              </motion.div>
            ) : friends && friends.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                >
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                </motion.div>
                <p className="text-muted-foreground">No friends yet</p>
                <p className="text-xs text-muted-foreground mt-1">Search for users to start chatting</p>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                </motion.div>
                <p className="text-muted-foreground">Search for someone</p>
                <p className="text-xs text-muted-foreground mt-1">Type a username to find people</p>
              </motion.div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
