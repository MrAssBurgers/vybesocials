import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { Skeleton } from '@/components/ui/skeleton';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export function AppLayout({ children, requireAuth = true }: AppLayoutProps) {
  const { user, loading } = useAuth();
  
  // Track online presence
  usePresence();
  
  // Optimize animations during scroll
  useScrollOptimization();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton variant="circular" className="h-16 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header - visible on all devices */}
      <MobileHeader />
      {/* Main content - consistent spacing on all devices */}
      <main className="pb-20 pt-14">
        {children}
      </main>
      {/* Bottom nav - visible on all devices */}
      <BottomNav />
    </div>
  );
}
