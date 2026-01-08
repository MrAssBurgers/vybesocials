import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { AIChatAssistant } from '@/components/ai/AIChatAssistant';
import { usePresence } from '@/hooks/usePresence';

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
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="md:ml-64 pb-20 md:pb-0">
        {children}
      </main>
      <BottomNav />
      <AIChatAssistant />
    </div>
  );
}
