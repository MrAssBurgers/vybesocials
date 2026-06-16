import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Eye, MessageCircle, Users, TrendingUp, Sparkles, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { triggerHaptic } from '@/lib/haptics';

interface WeeklyStats {
  postsCreated: number;
  likesReceived: number;
  commentsReceived: number;
  profileViews: number;
  newFollowers: number;
  topPost: { caption: string; likes: number } | null;
}

const SLIDES = ['welcome', 'engagement', 'growth', 'topPost', 'summary'] as const;
type Slide = typeof SLIDES[number];

export function WeeklyRecapModal() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [stats, setStats] = useState<WeeklyStats | null>(null);

  useEffect(() => {
    if (!user) return;

    // Check if we should show recap (once per week, Sunday evening)
    const lastShown = localStorage.getItem('vybe_weekly_recap_last');
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const hour = now.getHours();

    // Show on Sunday after 6pm, or Monday
    if (day !== 0 && day !== 1) return;
    if (day === 0 && hour < 18) return;

    if (lastShown) {
      const lastDate = new Date(lastShown);
      const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < 6) return;
    }

    fetchStats();
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    try {
      // Get user's posts from this week first
      const postsRes = await (db.from('posts') as any).select('id, caption', { count: 'exact' })
        .eq('author_id', user.id).gte('created_at', weekAgoStr);

      const postIds = (postsRes.data || []).map(p => p.id);

      const [likesRes, commentsRes, followersRes] = await Promise.all([
        postIds.length > 0
          ? db.from('likes').select('id', { count: 'exact' }).in('post_id', postIds).gte('created_at', weekAgoStr)
          : Promise.resolve({ count: 0 } as any),
        postIds.length > 0
          ? db.from('comments').select('id', { count: 'exact' }).in('post_id', postIds).gte('created_at', weekAgoStr)
          : Promise.resolve({ count: 0 } as any),
        db.from('follows').select('id', { count: 'exact' })
          .eq('following_id', user.id).gte('created_at', weekAgoStr),
      ]);

      // Find top post by likes count
      let topPost: WeeklyStats['topPost'] = null;
      if (postIds.length > 0) {
        // Count likes per post
        const { data: likeCounts } = await db
          .from('likes')
          .select('post_id')
          .in('post_id', postIds);

        if (likeCounts && likeCounts.length > 0) {
          const countMap: Record<string, number> = {};
          for (const l of likeCounts) {
            countMap[l.post_id] = (countMap[l.post_id] || 0) + 1;
          }
          const topId = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0];
          const topData = postsRes.data?.find(p => p.id === topId[0]);
          if (topData) {
            topPost = { caption: topData.caption || 'Your post', likes: topId[1] };
          }
        }
      }

      const weeklyStats: WeeklyStats = {
        postsCreated: postsRes.count || 0,
        likesReceived: likesRes.count || 0,
        commentsReceived: commentsRes.count || 0,
        profileViews: 0, // Could add view tracking later
        newFollowers: followersRes.count || 0,
        topPost,
      };

      // Only show if there's meaningful activity
      const hasActivity = weeklyStats.postsCreated > 0 || weeklyStats.likesReceived > 0 || weeklyStats.newFollowers > 0;
      if (hasActivity) {
        setStats(weeklyStats);
        setOpen(true);
        localStorage.setItem('vybe_weekly_recap_last', new Date().toISOString());
      }
    } catch (err) {
      console.error('[WeeklyRecap] Error fetching stats:', err);
    }
  };

  const next = () => {
    triggerHaptic('light');
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide(c => c + 1);
    } else {
      setOpen(false);
    }
  };

  if (!stats) return null;

  const slideContent = () => {
    const slide = SLIDES[currentSlide];
    switch (slide) {
      case 'welcome':
        return (
          <div className="text-center space-y-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl">🎉</motion.div>
            <h2 className="text-2xl font-bold">Your Week on VYBE</h2>
            <p className="text-muted-foreground">Here's how you did this week, {profile?.display_name || profile?.username || 'friend'}</p>
          </div>
        );
      case 'engagement':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-center">Engagement</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={<Heart className="h-5 w-5 text-destructive" />} label="Likes Received" value={stats.likesReceived} />
              <StatCard icon={<MessageCircle className="h-5 w-5 text-primary" />} label="Comments" value={stats.commentsReceived} />
            </div>
          </div>
        );
      case 'growth':
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-center">Growth</h2>
            <div className="grid grid-cols-2 gap-4">
              <StatCard icon={<Users className="h-5 w-5 text-accent-foreground" />} label="New Followers" value={stats.newFollowers} />
              <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="Posts Created" value={stats.postsCreated} />
            </div>
          </div>
        );
      case 'topPost':
        return stats.topPost ? (
          <div className="text-center space-y-4">
            <Sparkles className="h-8 w-8 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Your Top Post</h2>
            <p className="text-muted-foreground line-clamp-2">{stats.topPost.caption}</p>
            <p className="text-2xl font-bold text-primary">{stats.topPost.likes} ❤️</p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold">Keep Creating!</h2>
            <p className="text-muted-foreground">Post more this week to see your top content here ✨</p>
          </div>
        );
      case 'summary':
        return (
          <div className="text-center space-y-4">
            <motion.div initial={{ rotate: -10 }} animate={{ rotate: 10 }} transition={{ repeat: Infinity, repeatType: 'reverse', duration: 0.5 }} className="text-5xl">🚀</motion.div>
            <h2 className="text-xl font-bold">Keep the momentum!</h2>
            <p className="text-muted-foreground">You're doing great. See you next week!</p>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-none bg-gradient-to-br from-background via-background to-primary/5">
        <DialogTitle className="sr-only">Weekly Recap</DialogTitle>
        
        <button onClick={() => setOpen(false)} className="absolute top-3 right-3 z-10 p-1 rounded-full bg-muted/50 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>

        <div className="p-8 min-h-[320px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.25 }}
              className="flex-1 flex items-center justify-center"
            >
              {slideContent()}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between pt-6">
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentSlide ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
              ))}
            </div>

            <Button onClick={next} size="sm" className="rounded-full gap-1">
              {currentSlide === SLIDES.length - 1 ? 'Done' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="p-4 rounded-2xl bg-card/50 border border-border/30 text-center space-y-2"
    >
      <div className="flex justify-center">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </motion.div>
  );
}
