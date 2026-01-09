import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { AIChatAssistant } from '@/components/ai/AIChatAssistant';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
}

export function AppLayout({ children, requireAuth = true }: AppLayoutProps) {
  const { user, loading } = useAuth();
  
  // Track online presence
  usePresence();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="gradient-animated rounded-full p-4 animate-pulse">
          <span className="text-4xl">😂</span>
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
      {/* AI Assistant - available on all devices */}
      <AIChatAssistant />
    </div>
  );
}
