import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { publicProfilePath } from '@/lib/friendProfileRoutes';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * `/profile/:usernameOrId` → `/u/{username}`
 * Accepts either a username or profile id.
 */
export default function LegacyProfileRedirectPage() {
  const { usernameOrId } = useParams<{ usernameOrId: string }>();
  const { profile: me } = useAuth();

  const lookup = useQuery({
    queryKey: ['legacy-profile-redirect', usernameOrId],
    queryFn: async () => {
      if (!usernameOrId) return null;
      const asUsername = usernameOrId.trim().toLowerCase();

      const { data: byUsername } = await db
        .from('profiles')
        .select('username')
        .eq('username', asUsername)
        .maybeSingle();
      if ((byUsername as { username?: string } | null)?.username) {
        return (byUsername as { username: string }).username;
      }

      const { data: byId } = await db
        .from('profiles')
        .select('username')
        .eq('id', usernameOrId)
        .maybeSingle();
      if ((byId as { username?: string } | null)?.username) {
        return (byId as { username: string }).username;
      }

      return null;
    },
    enabled: !!usernameOrId,
    staleTime: 60_000,
  });

  if (!usernameOrId) {
    return <Navigate to={me?.username ? publicProfilePath(me.username) : '/'} replace />;
  }

  if (lookup.isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg p-4">
          <Skeleton className="h-52 w-full rounded-3xl" />
        </div>
      </AppLayout>
    );
  }

  if (!lookup.data) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg p-6">
          <EmptyState title="Profile not found" description="This profile could not be resolved." />
        </div>
      </AppLayout>
    );
  }

  return <Navigate to={publicProfilePath(lookup.data)} replace />;
}
