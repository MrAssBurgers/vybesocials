import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutualFriends, UserWithMutualFriends } from '@/hooks/useMutualFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Users, Search, X, Check, Clock, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFriendshipStatus, useSendFriendRequest, useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { 
    opacity: 1, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    x: -100,
    transition: { duration: 0.2 }
  }
};

// Helper to get display name from user
function getFullName(user: { first_name?: string | null; last_name?: string | null; display_name?: string | null; username: string }) {
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  if (user.first_name) return user.first_name;
  return user.display_name || user.username;
}

// Hook to get suggested users when no mutual friends exist
function useSuggestedUsers() {
  const { profile } = useAuth();
  const { data: friends } = useFriends();
  
  return useQuery({
    queryKey: ['suggested-users', profile?.id, friends?.length],
    queryFn: async (): Promise<UserWithMutualFriends[]> => {
      if (!profile?.id) return [];
      
      const friendIds = friends?.map(f => f.id) || [];
      
      let query = supabase
        .from('profiles')
        .select('id, username, display_name, first_name, last_name, avatar_url')
        .neq('id', profile.id)
        .limit(20);
      
      if (friendIds.length > 0) {
        query = query.not('id', 'in', `(${friendIds.join(',')})`);
      }
      
      const { data: users } = await query;
      
      if (!users || users.length === 0) return [];
      
      const usersWithFriendCount = await Promise.all(
        users.slice(0, 10).map(async (user) => {
          const { count } = await supabase
            .from('friend_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'accepted')
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
          
          return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            first_name: user.first_name,
            last_name: user.last_name,
            avatar_url: user.avatar_url,
            mutual_friends_count: 0,
            mutual_friends: [],
            total_friends: count || 0,
          };
        })
      );
      
      return usersWithFriendCount
        .sort((a, b) => (b.total_friends || 0) - (a.total_friends || 0))
        .slice(0, 8);
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}

import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';

export function MutualFriendsQuickAdd({ 
  onSelect 
}: { 
  onSelect: (userId: string) => void;
}) {
  const { profile } = useAuth();
  const { data: mutualSuggestions, isLoading: isLoadingMutual } = useMutualFriends();
  const { data: suggestedUsers, isLoading: isLoadingSuggested } = useSuggestedUsers();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithMutualFriends[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Use persistent dismissed state
  const { dismissedIds, dismissUser, isDismissed } = useDismissedQuickAdd();

  const suggestions = (mutualSuggestions?.length ?? 0) > 0 ? mutualSuggestions : suggestedUsers;
  const isLoading = isLoadingMutual || isLoadingSuggested;
  const hasMutualFriends = (mutualSuggestions?.length ?? 0) > 0;

  // Handle dismiss - now persists to localStorage
  const handleDismiss = (userId: string) => {
    dismissUser(userId);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, first_name, last_name, avatar_url')
        .neq('id', profile?.id || '')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,display_name.ilike.%${query}%,username.ilike.%${query}%`)
        .limit(10);

      if (data) {
        const results: UserWithMutualFriends[] = data.map(p => ({
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          first_name: p.first_name,
          last_name: p.last_name,
          avatar_url: p.avatar_url,
          mutual_friends_count: 0,
          mutual_friends: [],
        }));
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  const allUsers = searchQuery.length >= 2 ? searchResults : suggestions;
  const displayUsers = allUsers?.filter(u => !isDismissed(u.id));

  if (isLoading && !searchQuery) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground px-1">
          <Users className="h-3.5 w-3.5" />
          <span>Quick Add</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[140px] rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 pr-9 bg-muted/50 border-0 h-9 text-sm rounded-full"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs font-semibold text-foreground px-1">
        <Users className="h-3.5 w-3.5" />
        <span>
          {searchQuery 
            ? 'Search Results' 
            : 'Quick Add'}
        </span>
      </div>
      
      <AnimatePresence mode="popLayout">
        {isSearching ? (
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-[140px] rounded-2xl" />
            ))}
          </div>
        ) : displayUsers && displayUsers.length > 0 ? (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-2"
          >
            {displayUsers.slice(0, 6).map((user) => (
              <SnapchatStyleCard 
                key={user.id} 
                user={user} 
                onSelect={onSelect}
                onDismiss={handleDismiss}
              />
            ))}
          </motion.div>
        ) : searchQuery.length >= 2 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No users found
          </p>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">
            No suggestions available
          </p>
        )}
      </AnimatePresence>
    </div>
  );
}

function SnapchatStyleCard({
  user,
  onSelect,
  onDismiss,
}: {
  user: UserWithMutualFriends;
  onSelect: (userId: string) => void;
  onDismiss: (userId: string) => void;
}) {
  const navigate = useNavigate();
  const fullName = getFullName(user);
  const { data: friendship, isLoading: isLoadingStatus } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();
  const [isAdded, setIsAdded] = useState(false);
  
  const isFriends = friendship?.status === 'friends';
  const isPendingSent = friendship?.status === 'pending_sent' || isAdded;
  const isPendingReceived = friendship?.status === 'pending_received';
  const canAdd = friendship?.status === 'none' && !isAdded;

  const handleAddFriend = () => {
    sendRequest.mutate(user.id, {
      onSuccess: () => {
        setIsAdded(true);
        toast.success(`Added ${fullName}!`);
        // Auto-dismiss the card after adding
        onDismiss(user.id);
      },
    });
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(user.id);
  };

  const handleMessageClick = () => {
    if (isFriends) {
      onSelect(user.id);
    }
  };

  return (
    <motion.div
      layout
      variants={itemVariants}
      exit="exit"
      className="relative bg-card border border-border rounded-2xl p-3 flex flex-col items-center text-center"
    >
      {/* Dismiss X button - Snapchat style */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 h-5 w-5 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors"
      >
        <X className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Avatar */}
      <Avatar className="h-14 w-14 mb-2">
        <AvatarImage src={user.avatar_url || undefined} />
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary text-lg font-bold">
          {(user.first_name?.[0] || user.username[0]).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Name */}
      <p className="text-sm font-semibold truncate w-full px-1">{fullName}</p>
      
      {/* Username or Mutual friends with clickable avatars */}
      {user.mutual_friends_count > 0 && user.mutual_friends && user.mutual_friends.length > 0 ? (
        <div className="flex items-center gap-1 mb-2">
          <div className="flex -space-x-1">
            {user.mutual_friends.slice(0, 2).map((friend) => (
              <button
                key={friend.id}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/u/${friend.username}`);
                }}
                className="relative hover:z-10 transition-transform hover:scale-110 rounded-full"
                title={friend.first_name || friend.username}
              >
                <Avatar className="h-4 w-4 border border-background">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="text-[6px] bg-primary/20">
                    {friend.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground">
            {user.mutual_friends_count} mutual
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground mb-2 truncate w-full">
          @{user.username}
        </p>
      )}

      {/* Action Button - Snapchat style */}
      <div className="w-full">
        {isLoadingStatus ? (
          <Skeleton className="h-8 w-full rounded-full" />
        ) : isFriends ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleMessageClick}
            className="w-full h-8 rounded-full text-xs font-semibold gap-1.5"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Message
          </Button>
        ) : isPendingSent ? (
          <Button
            size="sm"
            variant="outline"
            disabled
            className="w-full h-8 rounded-full text-xs font-semibold gap-1.5 bg-muted/50"
          >
            <Clock className="h-3.5 w-3.5" />
            Pending
          </Button>
        ) : isPendingReceived ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            className="w-full h-8 rounded-full text-xs font-semibold gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
        ) : canAdd ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            disabled={sendRequest.isPending}
            className="w-full h-8 rounded-full text-xs font-semibold gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
