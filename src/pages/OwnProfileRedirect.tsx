import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { publicProfilePath } from '@/lib/friendProfileRoutes';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';

/** `/profile` → `/u/{me}` */
export default function OwnProfileRedirectPage() {
  const { profile, loading } = useAuth();

  if (loading || !profile?.username) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg space-y-4 p-4">
          <Skeleton className="h-52 w-full rounded-3xl" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AppLayout>
    );
  }

  return <Navigate to={publicProfilePath(profile.username)} replace />;
}
