import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { Skeleton } from '@/components/ui/skeleton';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
  showFAB?: boolean;
}

export function AppLayout({ children, requireAuth = true, showFAB = true }: AppLayoutProps) {
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
    <div className="min-h-screen">
      {/* Desktop sidebar - hidden on mobile and tablet */}
      <Sidebar />
      {/* Mobile/Tablet header - hidden on desktop */}
      <MobileHeader />
      {/* Main content - with proper spacing */}
      <main className="lg:ml-64 pb-20 lg:pb-0 pt-14 lg:pt-0">
        {children}
      </main>
      {/* Mobile/Tablet bottom nav - hidden on desktop */}
      <BottomNav />
      {/* Floating Action Button - includes VYBE Hub on double-tap */}
      {showFAB && <FloatingActionButton className="floating-action-button" />}
    </div>
  );
}
