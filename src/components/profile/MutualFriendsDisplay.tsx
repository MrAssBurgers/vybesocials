import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

interface MutualFriend {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
}

interface MutualFriendsDisplayProps {
  targetUserId: string;
  variant?: 'compact' | 'full';
  className?: string;
}

export function useMutualFriendsWithUser(targetUserId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['mutual-friends', profile?.id, targetUserId],
    queryFn: async (): Promise<MutualFriend[]> => {
      if (!profile?.id || !targetUserId || profile.id === targetUserId) return [];

      // Get current user's friends (accepted friend requests)
      const { data: myFriendsAsSender } = await supabase
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', profile.id)
        .eq('status', 'accepted');

      const { data: myFriendsAsReceiver } = await supabase
        .from('friend_requests')
        .select('sender_id')
        .eq('receiver_id', profile.id)
        .eq('status', 'accepted');

      const myFriendIds = new Set([
        ...(myFriendsAsSender || []).map(f => f.receiver_id),
        ...(myFriendsAsReceiver || []).map(f => f.sender_id),
      ]);

      if (myFriendIds.size === 0) return [];

      // Get target user's friends
      const { data: targetFriendsAsSender } = await supabase
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', targetUserId)
        .eq('status', 'accepted');

      const { data: targetFriendsAsReceiver } = await supabase
        .from('friend_requests')
        .select('sender_id')
        .eq('receiver_id', targetUserId)
        .eq('status', 'accepted');

      const targetFriendIds = new Set([
        ...(targetFriendsAsSender || []).map(f => f.receiver_id),
        ...(targetFriendsAsReceiver || []).map(f => f.sender_id),
      ]);

      // Find intersection (mutual friends)
      const mutualIds = Array.from(myFriendIds).filter(id => targetFriendIds.has(id));

      if (mutualIds.length === 0) return [];

      // Fetch profiles for mutual friends
      const { data: mutualProfiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', mutualIds)
        .limit(10);

      return mutualProfiles || [];
    },
    enabled: !!profile?.id && !!targetUserId && profile.id !== targetUserId,
    staleTime: 60000,
  });
}

export const MutualFriendsDisplay = memo(function MutualFriendsDisplay({
  targetUserId,
  variant = 'compact',
  className = '',
}: MutualFriendsDisplayProps) {
  const { data: mutualFriends, isLoading } = useMutualFriendsWithUser(targetUserId);

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }

  const count = mutualFriends?.length || 0;

  if (variant === 'compact') {
    // Always show something - never leave blank
    if (count === 0) {
      return (
        <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
          <Users className="h-3 w-3" />
          <span>No mutual friends</span>
        </div>
      );
    }

    // Show up to 3 profile pictures + "+X"
    const displayFriends = mutualFriends?.slice(0, 3) || [];
    const remaining = count - 3;

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex -space-x-2">
          {displayFriends.map((friend) => (
            <Avatar key={friend.id} className="h-5 w-5 border-2 border-background">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-[8px]">
                {friend.username?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ))}
          {remaining > 0 && (
            <div className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center">
              <span className="text-[8px] font-medium">+{remaining}</span>
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {count} mutual friend{count !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  // Full variant - also always show something
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {count === 0 ? 'No mutual friends' : `${count} mutual friend${count !== 1 ? 's' : ''}`}
        </span>
      </div>
      
      {count > 0 && (
        <div className="flex flex-wrap gap-2">
          {mutualFriends?.slice(0, 6).map((friend) => (
            <div key={friend.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Avatar className="h-6 w-6">
                <AvatarImage src={friend.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {friend.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">
                {friend.display_name || friend.username}
              </span>
            </div>
          ))}
          {count > 6 && (
            <div className="flex items-center px-3 py-2 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground">+{count - 6} more</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
