import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversations, useCreateConversation, Conversation } from '@/hooks/useMessages';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Plus, Search, Pin, Flame, Check, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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
          {/* Streak indicator would go here */}
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
              : lastMessage?.content || (lastMessage?.media_url ? '📷 Media' : 'No messages yet')}
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

  const { data: users, isLoading } = useQuery({
    queryKey: ['search-users', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];

      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .neq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .or(`username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`)
        .limit(20);

      return data || [];
    },
    enabled: searchQuery.length > 1,
  });

  const handleSelectUser = async (userId: string) => {
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [userId],
      });
      onOpenChange(false);
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
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
          <DialogTitle>{t('messages.newChat')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder={t('messages.searchUsers')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : users && users.length > 0 ? (
              users.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
                >
                  <Avatar>
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback>{user.username?.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="font-medium">{user.display_name || user.username}</p>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                  </div>
                </button>
              ))
            ) : searchQuery ? (
              <p className="text-center text-muted-foreground py-4">{t('messages.noUsersFound')}</p>
            ) : (
              <p className="text-center text-muted-foreground py-4">{t('messages.typeToSearch')}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
