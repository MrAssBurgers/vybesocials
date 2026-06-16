import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { liquidSpring } from '@/motion/liquidConfig';

const DISMISS_KEY = 'vybe-post-nudge-dismissed';
const DISMISS_TTL = 2 * 24 * 60 * 60 * 1000;

function readInitialDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (!dismissedAt) return false;
    return Date.now() - parseInt(dismissedAt, 10) < DISMISS_TTL;
  } catch {
    return false;
  }
}

export const PostNudgeWidget = memo(function PostNudgeWidget() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  // Read synchronously on first render — avoids a 1-frame flash where the
  // widget mounts visible, then hides itself in a useEffect.
  const [dismissed, setDismissed] = useState(readInitialDismissed);

  // Check if user posted in last 3 days
  const { data: hasRecentPost } = useQuery({
    queryKey: ['recent-post-check', profile?.id] as const,
    queryFn: async () => {
      if (!profile?.id) return true;
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await (db as any)
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', profile.id)
        .gte('created_at', threeDaysAgo);
      return (count ?? 0) > 0;
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  if (hasRecentPost || hasRecentPost === undefined || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={liquidSpring}
      className="relative rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20 p-5 text-center"
    >
        <button
          onClick={() => {
            setDismissed(true);
            localStorage.setItem('vybe-post-nudge-dismissed', String(Date.now()));
          }}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-3">
          <Camera className="h-5 w-5 text-primary" />
        </div>
        <h3 className="text-sm font-bold">Your followers miss you 💜</h3>
        <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-[220px] mx-auto">
          You haven't posted in a few days — share a VYBE and stay connected
        </p>
        <Button
          onClick={() => navigate('/upload')}
          className="rounded-full px-6 h-9 text-sm"
        >
          Share a VYBE
        </Button>
    </motion.div>
  );
});
