import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';

export function GreetingWidget() {
  const { profile } = useAuth();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl vibes';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  if (!profile) return null;

  return (
    <div className="px-4 pt-2 pb-1">
      <h1 className="text-base font-bold text-foreground tracking-tight">
        {greeting}, <span className="text-primary">@{profile.username}</span>
      </h1>
    </div>
  );
}
