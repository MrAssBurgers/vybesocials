import { memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, MessageCircle, Heart, Camera, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface EngagementStreak {
  type: 'posting' | 'reacting' | 'chatting';
  count: number;
  lastActivity: string;
}

interface EngagementStreaksProps {
  className?: string;
  showAll?: boolean;
}

const STREAK_ICONS = {
  posting: Camera,
  reacting: Heart,
  chatting: MessageCircle,
};

const STREAK_COLORS = {
  posting: 'text-purple-500',
  reacting: 'text-pink-500',
  chatting: 'text-blue-500',
};

const STREAK_LABELS = {
  posting: 'Post streak',
  reacting: 'React streak',
  chatting: 'Chat streak',
};

const StreakBadge = memo(function StreakBadge({ 
  streak 
}: { 
  streak: EngagementStreak;
}) {
  const Icon = STREAK_ICONS[streak.type];
  const color = STREAK_COLORS[streak.type];
  
  // Check if streak is about to expire (24h since last activity)
  const lastActivity = new Date(streak.lastActivity);
  const hoursLeft = Math.max(0, 24 - (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60));
  const isExpiringSoon = hoursLeft <= 6;

  if (streak.count === 0) return null;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/50',
        isExpiringSoon && 'ring-1 ring-orange-500/50'
      )}
    >
      <motion.div
        animate={isExpiringSoon ? { 
          scale: [1, 1.1, 1],
        } : {}}
        transition={{ repeat: Infinity, duration: 1 }}
      >
        <Icon className={cn('h-3.5 w-3.5', color)} />
      </motion.div>
      <span className="text-xs font-semibold">{streak.count}</span>
      {isExpiringSoon && (
        <span className="text-[10px] text-orange-500">
          {Math.floor(hoursLeft)}h
        </span>
      )}
    </motion.div>
  );
});

export const EngagementStreaks = memo(function EngagementStreaks({ 
  className,
  showAll = false 
}: EngagementStreaksProps) {
  const { profile } = useAuth();

  const { data: streaks } = useQuery({
    queryKey: ['engagement-streaks', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Get user's activity for streak calculation
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get posts for posting streak
      const { data: posts } = await supabase
        .from('posts')
        .select('created_at')
        .eq('author_id', profile.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Get likes for reacting streak
      const { data: likes } = await supabase
        .from('likes')
        .select('created_at')
        .eq('user_id', profile.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Get messages for chatting streak
      const { data: messages } = await supabase
        .from('messages')
        .select('created_at')
        .eq('sender_id', profile.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      // Calculate consecutive day streaks
      const calculateStreak = (dates: string[]): { count: number; lastActivity: string } => {
        if (!dates.length) return { count: 0, lastActivity: now.toISOString() };

        const sortedDates = dates
          .map(d => new Date(d))
          .sort((a, b) => b.getTime() - a.getTime());

        let streak = 0;
        let currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        const activityDates = new Set(
          sortedDates.map(d => {
            const date = new Date(d);
            date.setHours(0, 0, 0, 0);
            return date.toISOString();
          })
        );

        // Check if there was activity today or yesterday
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

        if (!activityDates.has(today.toISOString()) && !activityDates.has(yesterday.toISOString())) {
          return { count: 0, lastActivity: sortedDates[0]?.toISOString() || now.toISOString() };
        }

        // Count consecutive days
        for (let i = 0; i < 30; i++) {
          const checkDate = new Date(currentDate.getTime() - i * 24 * 60 * 60 * 1000);
          checkDate.setHours(0, 0, 0, 0);
          
          if (activityDates.has(checkDate.toISOString())) {
            streak++;
          } else if (i > 0) {
            break;
          }
        }

        return { count: streak, lastActivity: sortedDates[0]?.toISOString() || now.toISOString() };
      };

      const postingStreak = calculateStreak(posts?.map(p => p.created_at) || []);
      const reactingStreak = calculateStreak(likes?.map(l => l.created_at) || []);
      const chattingStreak = calculateStreak(messages?.map(m => m.created_at) || []);

      return [
        { type: 'posting' as const, ...postingStreak },
        { type: 'reacting' as const, ...reactingStreak },
        { type: 'chatting' as const, ...chattingStreak },
      ].filter(s => s.count > 0 || showAll);
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  if (!streaks?.length) return null;

  // Only show the highest streak if not showing all
  const displayStreaks = showAll 
    ? streaks 
    : [streaks.reduce((max, s) => s.count > max.count ? s : max)];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AnimatePresence mode="popLayout">
        {displayStreaks.map((streak) => (
          <StreakBadge key={streak.type} streak={streak} />
        ))}
      </AnimatePresence>
    </div>
  );
});

// Soft prompt component - shows encouraging messages without being naggy
export const SoftEngagementPrompt = memo(function SoftEngagementPrompt() {
  const { profile } = useAuth();

  const { data: prompt } = useQuery({
    queryKey: ['engagement-prompt', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      // Check user's recent activity
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { count: recentPosts } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', profile.id)
        .gte('created_at', oneDayAgo);

      const { count: recentLikes } = await supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .gte('created_at', oneDayAgo);

      const { count: recentMessages } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_id', profile.id)
        .gte('created_at', oneDayAgo);

      // Only show prompt if user has been somewhat active but could do more
      if ((recentPosts || 0) > 0 && (recentLikes || 0) < 3) {
        return { type: 'react', message: 'Spread some love! ❤️' };
      }
      if ((recentLikes || 0) > 5 && (recentMessages || 0) < 2) {
        return { type: 'chat', message: 'Say hi to a friend!' };
      }
      
      return null;
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (!prompt) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-primary/10 to-secondary/30 text-sm"
    >
      <Sparkles className="h-4 w-4 text-primary" />
      <span className="text-muted-foreground">{prompt.message}</span>
    </motion.div>
  );
});

export default EngagementStreaks;
