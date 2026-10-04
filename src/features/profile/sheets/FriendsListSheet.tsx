import { useProfileSectionQuery } from '@/features/profile/hooks/useProfileSectionQuery';
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
import { publicProfilePath } from '@/lib/friendProfileRoutes';

interface FriendsListSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  username?: string;
}

export function FriendsListSheet({
  open,
  onOpenChange,
  profileId,
  username,
}: FriendsListSheetProps) {
  const { data: users, isLoading, isError, refetch } = useProfileSectionQuery(['profile-friends-list', profileId], open && !!profileId, async guard => {
      const [asSender, asReceiver] = await Promise.all([
        db
          .from('friend_requests')
          .select('receiver_id')
          .eq('sender_id', profileId)
          .eq('status', 'accepted')
          .limit(200),
        db
          .from('friend_requests')
          .select('sender_id')
          .eq('receiver_id', profileId)
          .eq('status', 'accepted')
          .limit(200),
      ]);

      guard();
      if (asSender.error || asReceiver.error) throw new Error('Friends could not be loaded.');
      const ids = [
        ...(asSender.data || []).map((r) => (r as { receiver_id: string }).receiver_id),
        ...(asReceiver.data || []).map((r) => (r as { sender_id: string }).sender_id),
      ].filter(Boolean);

      const unique = [...new Set(ids)];
      if (!unique.length) return [];

      const profiles: Array<{
        id: string;
        username: string;
        avatar_url: string | null;
        display_name: string | null;
      }> = [];

      guard();
      for (let i = 0; i < unique.length; i += 10) {
        guard();
        const chunk = unique.slice(i, i + 10);
        const { data: batch, error: batchError } = await db
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .in('id', chunk);
        guard();
        if (batchError) throw batchError;
        profiles.push(...((batch || []) as typeof profiles));
      }

      guard();
      return profiles.sort((a, b) => a.username.localeCompare(b.username));
    }
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{username ? `@${username}'s friends` : 'Friends'}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          {isError && <div role="alert"><p>This list is unavailable.</p><button type="button" className="min-h-11 text-primary" onClick={() => void refetch()}>Retry list</button></div>}
          {!isLoading && !isError && !(users || []).length && (
            <p className="py-8 text-center text-sm text-muted-foreground">No friends to show.</p>
          )}
          {(users || []).map((u) => (
            <Link
              key={u.id}
              to={publicProfilePath(u.username)}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted/60"
            >
              <Avatar className="h-10 w-10">
                <AvatarImage src={u.avatar_url || undefined} />
                <AvatarFallback>{u.username.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{u.display_name || u.username}</p>
                <StyledUsername userId={u.id} username={u.username} showAtSymbol className="text-xs" />
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
