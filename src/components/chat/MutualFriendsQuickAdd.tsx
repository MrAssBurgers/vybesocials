import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.8, y: 20 },
  show: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 25 }
  },
};

// Helper to get display name from user
function getFullName(user: { first_name?: string | null; last_name?: string | null; display_name?: string | null; username: string }) {
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
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
      
      // Get IDs to exclude (self + existing friends)
      const friendIds = friends?.map(f => f.id) || [];
      const excludeIds = [profile.id, ...friendIds];
      
      // Build query - exclude self and existing friends
      let query = supabase
        .from('profiles')
        .select('id, username, display_name, first_name, last_name, avatar_url')
        .neq('id', profile.id)
        .limit(20);
      
      // Also exclude existing friends if any
      if (friendIds.length > 0) {
        query = query.not('id', 'in', `(${friendIds.join(',')})`);
      }
      
      const { data: users, error } = await query;
      
      console.log('[useSuggestedUsers] Fetched users:', users?.length, error);
      
      if (!users || users.length === 0) return [];
      
      // For each user, count how many friends they have (for popularity sorting)
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
            mutual_friends_count: 0, // No mutual friends, this is discovery
            mutual_friends: [],
            total_friends: count || 0,
          };
        })
      );
      
      // Sort by friend count descending (popular users first)
      return usersWithFriendCount
        .sort((a, b) => (b.total_friends || 0) - (a.total_friends || 0))
        .slice(0, 6);
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}

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

  // Use mutual friends if available, otherwise fall back to suggested users
  const suggestions = (mutualSuggestions?.length ?? 0) > 0 ? mutualSuggestions : suggestedUsers;
  const isLoading = isLoadingMutual || isLoadingSuggested;
  const hasMutualFriends = (mutualSuggestions?.length ?? 0) > 0;

  // Search by name
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
        // Convert to UserWithMutualFriends format (without mutual friend data for search)
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

  const displayUsers = searchQuery.length >= 2 ? searchResults : suggestions;

  if (isLoading && !searchQuery) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Users className="h-3 w-3" />
          <span>Quick Add</span>
        </div>
        <div className="space-y-1.5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search by name */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9 pr-9 bg-card border-border h-9 text-sm"
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

      <motion.div 
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-xs text-muted-foreground px-1"
      >
        <Users className="h-3 w-3 animate-pulse" />
        <span>
          {searchQuery 
            ? 'Search Results' 
            : hasMutualFriends 
              ? 'Quick Add' 
              : 'Suggested Users'}
        </span>
      </motion.div>
      
      <AnimatePresence mode="wait">
        {isSearching ? (
          <div className="space-y-1.5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-lg" />
            ))}
          </div>
        ) : displayUsers && displayUsers.length > 0 ? (
          <motion.div 
            key={searchQuery}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-1.5"
          >
            {displayUsers.slice(0, 6).map((user) => (
              <MutualFriendCard 
                key={user.id} 
                user={user} 
                onSelect={onSelect}
                showMutualBadge={hasMutualFriends}
              />
            ))}
          </motion.div>
        ) : searchQuery.length >= 2 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No users found for "{searchQuery}"
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MutualFriendCard({
  user,
  onSelect,
  showMutualBadge = true,
}: {
  user: UserWithMutualFriends;
  onSelect: (userId: string) => void;
  showMutualBadge?: boolean;
}) {
  const fullName = getFullName(user);
  const { data: friendship, isLoading: isLoadingStatus } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();
  
  const isFriends = friendship?.status === 'friends';
  const isPendingSent = friendship?.status === 'pending_sent';
  const isPendingReceived = friendship?.status === 'pending_received';
  const canAdd = friendship?.status === 'none';

  // Get mutual friend names for tooltip
  const getMutualFriendName = (mf: { first_name?: string | null; last_name?: string | null; username: string }) => {
    if (mf.first_name) return mf.first_name;
    return mf.username;
  };

  const handleAddFriend = (e: React.MouseEvent) => {
    e.stopPropagation();
    sendRequest.mutate(user.id, {
      onSuccess: () => {
        toast.success(`Friend request sent to ${fullName}`);
      },
    });
  };

  const handleMessageClick = () => {
    if (isFriends) {
      onSelect(user.id);
    }
  };

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className="relative bg-card border border-border rounded-lg p-2 flex items-center gap-2 hover:shadow-md transition-shadow group"
    >
      {/* Avatar section */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-9 w-9 ring-1 ring-background">
          <AvatarImage src={user.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {(user.first_name?.[0] || user.username[0]).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Status indicator */}
        {isFriends && (
          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-emerald-500 rounded-full flex items-center justify-center">
            <Check className="h-2.5 w-2.5 text-white" />
          </div>
        )}
        {isPendingSent && (
          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-amber-500 rounded-full flex items-center justify-center">
            <Clock className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>
      
      {/* Info section */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{fullName}</p>
        {user.mutual_friends_count > 0 ? (
          <p className="text-[10px] text-muted-foreground">
            {user.mutual_friends_count} mutual friend{user.mutual_friends_count > 1 ? 's' : ''}
          </p>
        ) : user.first_name ? (
          <p className="text-[10px] text-muted-foreground truncate">@{user.username}</p>
        ) : null}
      </div>

      {/* Action button */}
      <div className="flex-shrink-0">
        {isLoadingStatus ? (
          <Skeleton className="h-6 w-6 rounded-full" />
        ) : isFriends ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleMessageClick}
            className="h-6 w-6 rounded-full"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        ) : isPendingSent ? (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
            <Clock className="h-3 w-3 text-muted-foreground" />
          </div>
        ) : isPendingReceived ? (
          <Button
            size="icon"
            variant="default"
            onClick={handleAddFriend}
            className="h-6 w-6 rounded-full"
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        ) : canAdd ? (
          <Button
            size="icon"
            variant="default"
            onClick={handleAddFriend}
            disabled={sendRequest.isPending}
            className="h-6 w-6 rounded-full"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
