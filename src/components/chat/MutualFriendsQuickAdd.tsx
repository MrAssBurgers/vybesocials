import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useMutualFriends, UserWithMutualFriends } from '@/hooks/useMutualFriends';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, X, Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFriendshipStatus, useSendFriendRequest, useFriends } from '@/hooks/useFriends';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDismissProfile } from '@/hooks/useDismissedProfiles';
import { useHiddenFromDiscovery } from '@/hooks/useOutgoingRequests';
import { cn } from '@/lib/utils';

function getFullName(user: { first_name?: string | null; last_name?: string | null; display_name?: string | null; username: string }) {
  if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
  if (user.first_name) return user.first_name;
  return user.display_name || user.username;
}

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

      // Get my interests for matching
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('interests')
        .eq('id', profile.id)
        .maybeSingle();
      const myInterests = new Set<string>(
        (myProfile?.interests || []).map((i: string) => i.toLowerCase())
      );

      let query = (supabase
        .from('profiles' as any)
        .select('id, username, display_name, first_name, last_name, avatar_url, interests')
        .neq('id', profile.id)
        .order('created_at', { ascending: false })
        .limit(60)) as any;
      
      if (friendIds.length > 0) {
        query = query.not('id', 'in', `(${friendIds.join(',')})`);
      }
      
      const { data: users } = await query;
      if (!users || users.length === 0) return [];
      
      return (users as any[])
        .filter((u: any) => !allHiddenIds.has(u.id))
        .map((user: any) => {
          const theirInterests = (user.interests || []).map((i: string) => i.toLowerCase());
          const shared = theirInterests.filter((i: string) => myInterests.has(i));
          const interestScore = shared.length * 4;
          const completeness = (user.avatar_url ? 1 : 0) + (user.display_name ? 0.5 : 0);

          return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            first_name: user.first_name,
            last_name: user.last_name,
            avatar_url: user.avatar_url,
            mutual_friends_count: 0,
            mutual_friends: [],
            affinity_score: interestScore + completeness,
            shared_interests: shared,
            is_recently_active: true,
          };
        })
        .sort((a: any, b: any) => b.affinity_score - a.affinity_score)
        .slice(0, 12);
    },
    enabled: !!profile?.id,
    staleTime: 60000,
    gcTime: 300000,
  });
}

export function MutualFriendsQuickAdd({ 
  onSelect 
}: { 
  onSelect: (userId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: mutualSuggestions, isLoading: isLoadingMutual } = useMutualFriends();
  const { data: suggestedUsers, isLoading: isLoadingSuggested } = useSuggestedUsers();
  const { data: hiddenIds } = useHiddenFromDiscovery();
  const dismissProfile = useDismissProfile();
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback((userId: string) => {
    setLocalDismissed(prev => new Set([...prev, userId]));
    dismissProfile.mutate(userId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
        queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
        queryClient.invalidateQueries({ queryKey: ['hidden-from-discovery'] });
      }
    });
  }, [dismissProfile, queryClient]);

  const isUserHidden = (userId: string) => localDismissed.has(userId) || hiddenIds?.has(userId);

  // Show mutual friends first, then fallback to general suggestions
  const mutualUsers = mutualSuggestions?.filter(u => !isUserHidden(u.id) && u.mutual_friends_count > 0) || [];
  const generalUsers = suggestedUsers?.filter(u => !isUserHidden(u.id) && !mutualUsers.some(m => m.id === u.id)) || [];
  const displayUsers = [...mutualUsers, ...generalUsers];

  const isLoading = isLoadingMutual && isLoadingSuggested;

  if (isLoading) {
    return (
      <div className="space-y-1.5">
        <div className="px-1">
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Quick Add</span>
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-[140px] w-[100px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (displayUsers.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="px-1">
        <span className="text-xs font-semibold text-foreground tracking-wide uppercase">Quick Add</span>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <AnimatePresence mode="popLayout">
          {displayUsers.slice(0, 8).map((user) => (
            <QuickAddCard 
              key={user.id} 
              user={user} 
              onSelect={onSelect}
              onDismiss={handleDismiss}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function QuickAddCard({
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
  const [justAdded, setJustAdded] = useState(false);
  
  const isFriends = friendship?.status === 'friends';
  const isPendingReceived = friendship?.status === 'pending_received';
  const canAdd = friendship?.status === 'none';

  const handleAddFriend = (e: React.MouseEvent) => {
    e.stopPropagation();
    setJustAdded(true);
    sendRequest.mutate(user.id, {
      onSuccess: () => {
        toast.success(`Friend request sent to ${fullName}`);
        setTimeout(() => {
          onDismiss(user.id);
          queryClient.invalidateQueries({ queryKey: ['hidden-from-discovery'] });
          queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
          queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
          queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
        }, 600);
      },
      onError: () => {
        setJustAdded(false);
      }
    });
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDismiss(user.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: justAdded ? 0.6 : 1, 
        scale: justAdded ? 0.95 : 1,
      }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className="relative w-[100px] shrink-0 snap-start"
    >
      <div className={cn(
        "relative flex flex-col items-center rounded-xl p-2 pt-2 bg-card border border-border/60 transition-all",
        justAdded && "border-primary/40 bg-primary/5"
      )}>
        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-muted/90 hover:bg-muted flex items-center justify-center transition-colors z-10"
        >
          <X className="h-2 w-2 text-muted-foreground" />
        </button>

        {/* Avatar */}
        <button
          onClick={() => navigate(`/u/${user.username}`)}
          className="focus:outline-none mb-2"
          type="button"
        >
          <Avatar className="h-12 w-12 ring-2 ring-border/40 hover:ring-primary/50 transition-all">
            <AvatarImage src={user.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </button>

        {/* Name */}
        <button
          onClick={() => navigate(`/u/${user.username}`)}
          className="text-xs font-semibold truncate w-full text-center hover:text-primary transition-colors leading-tight"
          type="button"
        >
          {fullName}
        </button>
        
        {/* Mutual friends or username */}
        {user.mutual_friends_count > 0 ? (
          <div className="flex items-center gap-1 mt-0.5 mb-1.5">
            {user.mutual_friends.length > 0 && (
              <div className="flex -space-x-1.5">
                {user.mutual_friends.slice(0, 2).map((friend) => (
                  <Avatar key={friend.id} className="h-3.5 w-3.5 border border-card">
                    <AvatarImage src={friend.avatar_url || undefined} />
                    <AvatarFallback className="text-[5px] bg-primary/20">
                      {friend.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}
            <span className="text-[10px] text-muted-foreground leading-none">
              {user.mutual_friends_count} mutual{user.mutual_friends_count !== 1 ? 's' : ''}
            </span>
          </div>
        ) : user.shared_interests && user.shared_interests.length > 0 ? (
          <div className="flex items-center gap-0.5 mt-0.5 mb-1.5 flex-wrap justify-center">
            <span className="text-[10px] text-primary/80 leading-none">
              {user.shared_interests.slice(0, 2).join(' · ')}
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-0.5 mb-1.5 truncate w-full text-center leading-none">
            @{user.username}
          </p>
        )}

        {/* Action */}
        {isLoadingStatus ? (
          <Skeleton className="h-7 w-full rounded-full" />
        ) : justAdded ? (
          <div className="h-7 w-full rounded-full bg-primary/20 flex items-center justify-center">
            <Check className="h-3.5 w-3.5 text-primary" />
          </div>
        ) : isFriends ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => { e.stopPropagation(); onSelect(user.id); }}
            className="w-full h-7 rounded-full text-[10px] font-semibold gap-1"
          >
            <MessageCircle className="h-3 w-3" />
            Chat
          </Button>
        ) : isPendingReceived ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            className="w-full h-7 rounded-full text-[10px] font-semibold gap-1"
          >
            <Check className="h-3 w-3" />
            Accept
          </Button>
        ) : canAdd ? (
          <Button
            size="sm"
            variant="default"
            onClick={handleAddFriend}
            disabled={sendRequest.isPending}
            className="w-full h-7 rounded-full text-[10px] font-semibold gap-1 bg-primary hover:bg-primary/90"
          >
            <UserPlus className="h-3 w-3" />
            Add
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
