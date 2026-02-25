import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMutualFriends } from '@/hooks/useFriendsOfFriends';
import { Link } from 'react-router-dom';

interface MutualFriendsBadgeProps {
  targetUserId: string;
  compact?: boolean;
}

/**
 * Shows mutual friends count with avatar stack.
 * Use on profiles, search results, event attendees.
 */
export function MutualFriendsBadge({ targetUserId, compact = false }: MutualFriendsBadgeProps) {
  const { data: mutuals, isLoading } = useMutualFriends(targetUserId);

  if (isLoading || !mutuals || mutuals.length === 0) return null;

  if (compact) {
    return (
      <span className="text-xs text-muted-foreground">
        {mutuals.length} mutual friend{mutuals.length !== 1 ? 's' : ''}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {mutuals.slice(0, 3).map((friend) => (
          <Link key={friend.id} to={`/u/${friend.username}`}>
            <Avatar className="h-5 w-5 border-2 border-background">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-[8px]">
                {(friend.display_name || friend.username)?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </Link>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {mutuals.length} mutual friend{mutuals.length !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
