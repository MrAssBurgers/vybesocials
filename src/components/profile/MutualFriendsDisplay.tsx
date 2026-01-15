import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
      if (!profile?.id || !targetUserId || profile.id === targetUserId) {
        return [];
      }

      // Use the security definer function to bypass RLS
      const { data, error } = await supabase
        .rpc('get_mutual_friends', {
          current_user_id: profile.id,
          target_user_id: targetUserId
        });

      if (error) {
        console.error('[MutualFriends] Error:', error);
        return [];
      }

      return (data || []) as MutualFriend[];
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
  const navigate = useNavigate();
  const { profile: currentUser } = useAuth();
  const { data: mutualFriends, isLoading, error } = useMutualFriendsWithUser(targetUserId);

  const handleProfileClick = (username: string) => {
    navigate(`/u/${username}`);
  };

  // Don't show anything if user is not logged in
  if (!currentUser) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    );
  }

  if (error) {
    console.error('[MutualFriends] Query error:', error);
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
            <button
              key={friend.id}
              onClick={() => handleProfileClick(friend.username)}
              className="relative hover:z-10 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full"
              title={friend.display_name || friend.username}
            >
              <Avatar className="h-6 w-6 border-2 border-background cursor-pointer">
                <AvatarImage src={friend.avatar_url || undefined} />
                <AvatarFallback className="text-[10px] bg-primary/20">
                  {friend.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </button>
          ))}
          {remaining > 0 && (
            <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
              <span className="text-[9px] font-medium">+{remaining}</span>
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
            <button
              key={friend.id}
              onClick={() => handleProfileClick(friend.username)}
              className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={friend.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {friend.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">
                {friend.display_name || friend.username}
              </span>
            </button>
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
