import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutualFriends, UserWithMutualFriends } from '@/hooks/useMutualFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Users, Search, X, Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFriendshipStatus, useSendFriendRequest, useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDismissProfile } from '@/hooks/useDismissedProfiles';
import { useHiddenFromDiscovery } from '@/hooks/useOutgoingRequests';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.15, ease: 'easeOut' as const }
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.1 }
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

// Hook to get suggested users when no mutual friends exist - with Snapchat-style filtering
function useSuggestedUsers() {
  const { profile } = useAuth();
  const { data: friends } = useFriends();
  const { data: hiddenIds } = useHiddenFromDiscovery();
  
  return useQuery({
    queryKey: ['suggested-users', profile?.id, friends?.length, hiddenIds?.size],
    queryFn: async (): Promise<UserWithMutualFriends[]> => {
      if (!profile?.id) return [];
      
      const friendIds = friends?.map(f => f.id) || [];
      const allHiddenIds = hiddenIds || new Set<string>();
      
      // Build query with proper exclusions
      let query = supabase
        .from('public_profiles')
        .select('id, username, display_name, first_name, last_name, avatar_url')
        .neq('id', profile.id)
        .order('created_at', { ascending: false })
        .limit(40); // Fetch more to account for filtering
      
      // Exclude existing friends
      if (friendIds.length > 0) {
        query = query.not('id', 'in', `(${friendIds.join(',')})`);
      }
      
      const { data: users } = await query;
      
      if (!users || users.length === 0) return [];
      
      // Filter out hidden users (pending outgoing, dismissed, blocked)
      const filteredUsers = users.filter(u => !allHiddenIds.has(u.id));
      
      // Batch fetch friend counts for performance
      const usersToShow = filteredUsers.slice(0, 12);
      
      // Fetch friend counts and build results
      const usersWithFriendCount = await Promise.all(
        usersToShow.map(async (user) => {
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
            mutual_friends_count: count || 0, // Use mutual_friends_count to store total for sorting
            mutual_friends: [],
          };
        })
      );
      
      // Sort by friend count (more popular users first)
      return usersWithFriendCount
        .sort((a, b) => b.mutual_friends_count - a.mutual_friends_count)
        .slice(0, 8);
    },
    enabled: !!profile?.id,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 300000, // Keep in cache for 5 minutes
  });
}

export function MutualFriendsQuickAdd({ 
  onSelect 
}: { 
  onSelect: (userId: string) => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: mutualSuggestions, isLoading: isLoadingMutual } = useMutualFriends();
  const { data: suggestedUsers, isLoading: isLoadingSuggested } = useSuggestedUsers();
  const { data: hiddenIds } = useHiddenFromDiscovery();
  const dismissProfile = useDismissProfile();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserWithMutualFriends[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());

  const suggestions = (mutualSuggestions?.length ?? 0) > 0 ? mutualSuggestions : suggestedUsers;
  const isLoading = isLoadingMutual || isLoadingSuggested;

  // Handle dismiss - persists to database (Snapchat-style permanent hide)
  const handleDismiss = (userId: string) => {
    // Immediately hide locally for instant feedback
    setLocalDismissed(prev => new Set([...prev, userId]));
    
    // Persist to database
    dismissProfile.mutate(userId, {
      onSuccess: () => {
        // Invalidate queries to refresh lists
        queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
        queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
        queryClient.invalidateQueries({ queryKey: ['hidden-from-discovery'] });
      }
    });
  };

  // Debounced search with improved performance
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
    // Debounce implementation via setTimeout
    const searchTimeout = setTimeout(async () => {
      try {
        // Use case-insensitive search with exact match prioritization
        const { data } = await supabase
          .from('public_profiles')
          .select('id, username, display_name, first_name, last_name, avatar_url')
          .neq('id', profile?.id || '')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .order('username', { ascending: true })
          .limit(20);

        if (data) {
          // Filter out hidden users from search results
          const allHidden = hiddenIds || new Set<string>();
          const filteredData = data.filter(p => !allHidden.has(p.id) && !localDismissed.has(p.id));
          
          // Sort results: exact username matches first, then partial
          const sortedData = filteredData.sort((a, b) => {
            const aExact = a.username.toLowerCase() === query.toLowerCase();
            const bExact = b.username.toLowerCase() === query.toLowerCase();
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            return 0;
          });
          
          const results: UserWithMutualFriends[] = sortedData.map(p => ({
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
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [profile?.id, hiddenIds, localDismissed]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // Combine all filters: hidden from discovery + locally dismissed
  const isUserHidden = (userId: string) => {
    if (localDismissed.has(userId)) return true;
    if (hiddenIds?.has(userId)) return true;
    return false;
  };

  const allUsers = searchQuery.length >= 2 ? searchResults : suggestions;
  const displayUsers = allUsers?.filter(u => !isUserHidden(u.id));

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
  const queryClient = useQueryClient();
  const fullName = getFullName(user);
  const { data: friendship, isLoading: isLoadingStatus } = useFriendshipStatus(user.id);
  const sendRequest = useSendFriendRequest();
  
  const isFriends = friendship?.status === 'friends';
  const isPendingReceived = friendship?.status === 'pending_received';
  // Snapchat-style: if they already sent a request, this card shouldn't show at all
  // But just in case, treat it as "can add" (Accept for incoming)
  const canAdd = friendship?.status === 'none';

  const handleAddFriend = () => {
    sendRequest.mutate(user.id, {
      onSuccess: () => {
        toast.success(`Added ${fullName}!`);
        // Immediately dismiss the card (Snapchat behavior: sent = disappear)
        onDismiss(user.id);
        // Invalidate queries to ensure this user is hidden everywhere
        queryClient.invalidateQueries({ queryKey: ['hidden-from-discovery'] });
        queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
        queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
        queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
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
      variants={itemVariants}
      exit="exit"
      className="relative bg-card border border-border rounded-2xl p-2.5 sm:p-3 flex flex-col items-center text-center"
    >
      {/* Dismiss X button - smaller on mobile */}
      <button
        onClick={handleDismiss}
        className="absolute top-1 right-1 sm:top-2 sm:right-2 h-4 w-4 sm:h-6 sm:w-6 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors z-10"
        title="Hide forever"
      >
        <X className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
      </button>

      {/* Avatar - clickable to view profile */}
      <button
        onClick={() => navigate(`/u/${user.username}`)}
        className="focus:outline-none"
        type="button"
      >
        <Avatar className="h-11 w-11 sm:h-14 sm:w-14 mb-1.5 sm:mb-2 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
          <AvatarImage src={user.avatar_url || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent/20 text-primary text-base sm:text-lg font-bold">
            {(user.first_name?.[0] || user.username[0]).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </button>

      {/* Name - clickable to view profile */}
      <button
        onClick={() => navigate(`/u/${user.username}`)}
        className="text-xs sm:text-sm font-semibold truncate w-full px-0.5 hover:text-primary transition-colors cursor-pointer"
        type="button"
      >
        {fullName}
      </button>
      
      {/* Username or Mutual friends with clickable avatars */}
      {user.mutual_friends_count > 0 && user.mutual_friends && user.mutual_friends.length > 0 ? (
        <div className="flex items-center gap-1 mb-1.5 sm:mb-2">
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
                <Avatar className="h-3.5 w-3.5 sm:h-4 sm:w-4 border border-background">
                  <AvatarImage src={friend.avatar_url || undefined} />
                  <AvatarFallback className="text-[5px] sm:text-[6px] bg-primary/20">
                    {friend.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            ))}
          </div>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground">
            {user.mutual_friends_count} mutual
          </span>
        </div>
      ) : (
        <p className="text-[10px] sm:text-[11px] text-muted-foreground mb-1.5 sm:mb-2 truncate w-full">
          @{user.username}
        </p>
      )}

      {/* Action Button - Snapchat style (no "Pending" state - they disappear) */}
      <div className="w-full">
        {isLoadingStatus ? (
          <Skeleton className="h-7 sm:h-8 w-full rounded-full" />
        ) : isFriends ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleMessageClick}
            className="w-full h-7 sm:h-8 rounded-full text-[10px] sm:text-xs font-semibold gap-1"
          >
            <MessageCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Message
          </Button>
        ) : isPendingReceived ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            className="w-full h-7 sm:h-8 rounded-full text-[10px] sm:text-xs font-semibold gap-1"
          >
            <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Accept
          </Button>
        ) : canAdd ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            disabled={sendRequest.isPending}
            className="w-full h-7 sm:h-8 rounded-full text-[10px] sm:text-xs font-semibold gap-1"
          >
            <UserPlus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            Add
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
