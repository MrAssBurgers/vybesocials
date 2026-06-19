import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { db } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StyledUsername } from '@/components/ui/StyledUsername';

type ListMode = 'followers' | 'following';

interface FollowersFollowingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  mode: ListMode;
  username?: string;
}

export function FollowersFollowingSheet({
  open,
  onOpenChange,
  profileId,
  mode,
  username,
}: FollowersFollowingSheetProps) {
  const { data: users, isLoading } = useQuery({
    queryKey: ['follow-list', profileId, mode],
    queryFn: async () => {
      const field = mode === 'followers' ? 'following_id' : 'follower_id';
      const joinField = mode === 'followers' ? 'follower_id' : 'following_id';

      const { data: rows, error } = await db
        .from('follows')
        .select('follower_id, following_id, created_at')
        .eq(field, profileId)
        .limit(200);

      if (error) throw error;

      const userIds = [...new Set((rows || []).map((r) => r[joinField]).filter(Boolean))];
      if (!userIds.length) return [];

      const profiles: Array<{
        id: string;
        username: string;
        avatar_url: string | null;
        display_name: string | null;
      }> = [];

      for (let i = 0; i < userIds.length; i += 10) {
        const chunk = userIds.slice(i, i + 10);
        const { data: batch } = await db
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .in('id', chunk);
        profiles.push(...(batch || []));
      }

      return profiles.sort((a, b) => a.username.localeCompare(b.username));
    },
    enabled: open && !!profileId,
    staleTime: 60_000,
  });

  const title =
    mode === 'followers'
      ? username
        ? `@${username}'s followers`
        : 'Followers'
      : username
        ? `@${username} follows`
        : 'Following';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[min(80dvh,640px)] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border/40">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-2">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : !users?.length ? (
            <p className="text-sm text-muted-foreground text-center py-10 px-4">
              {mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/30">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    to={`/u/${user.username}`}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {user.display_name || user.username}
                      </p>
                      <StyledUsername userId={user.id} username={user.username} className="text-xs text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
