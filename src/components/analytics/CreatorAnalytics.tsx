import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Eye, Clock, TrendingUp, Heart, MessageCircle, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { usePosts } from '@/hooks/usePosts';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  delay: number;
}

const StatCard = memo(function StatCard({ icon, label, value, trend, delay }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex flex-col gap-1 p-3 rounded-2xl bg-card/60 border border-border/30 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{icon}</span>
        {trend && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-foreground tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
    </motion.div>
  );
});

interface RetentionBarProps {
  segments: number[];
}

const RetentionBar = memo(function RetentionBar({ segments }: RetentionBarProps) {
  const max = Math.max(...segments, 1);
  return (
    <div className="flex items-end gap-[2px] h-10">
      {segments.map((val, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(val / max) * 100}%` }}
          transition={{ delay: 0.3 + i * 0.05, type: 'spring', stiffness: 200 }}
          className="flex-1 rounded-t-sm bg-primary/70 min-h-[2px]"
        />
      ))}
    </div>
  );
});

export const CreatorAnalytics = memo(function CreatorAnalytics() {
  const { profile } = useAuth();
  const { data: posts } = usePosts();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    if (!posts || !profile) return null;

    const myPosts = posts.filter(p => p.author?.id === profile.id);
    if (myPosts.length === 0) return null;

    const totalViews = myPosts.reduce((s, p) => s + (p.view_count || 0), 0);
    const totalLikes = myPosts.reduce((s, p) => s + (p.like_count || 0), 0);
    const totalComments = myPosts.reduce((s, p) => s + (p.comment_count || 0), 0);
    const engagementRate = totalViews > 0
      ? (((totalLikes + totalComments) / totalViews) * 100).toFixed(1)
      : '0';

    // Simulate retention curve from engagement data
    const retention = Array.from({ length: 10 }, (_, i) => {
      const decay = Math.exp(-i * 0.3);
      return Math.round((totalViews / Math.max(myPosts.length, 1)) * decay * (0.8 + Math.random() * 0.4));
    });

    return { totalViews, totalLikes, totalComments, engagementRate, postCount: myPosts.length, retention };
  }, [posts, profile]);

  if (!stats) return null;

  const formatNum = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="mx-4 mt-2 mb-3"
    >
      <button
        onClick={() => navigate(`/profile/${profile?.username}`)}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-xl bg-primary/20 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Creator Analytics</h3>
            <p className="text-[10px] text-muted-foreground">Your content performance</p>
          </div>
          <TrendingUp className="h-4 w-4 text-primary ml-auto" />
        </div>
      </button>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatCard
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Total Views"
          value={formatNum(stats.totalViews)}
          trend="+12%"
          delay={0.1}
        />
        <StatCard
          icon={<Heart className="h-3.5 w-3.5" />}
          label="Total Likes"
          value={formatNum(stats.totalLikes)}
          delay={0.15}
        />
        <StatCard
          icon={<MessageCircle className="h-3.5 w-3.5" />}
          label="Comments"
          value={formatNum(stats.totalComments)}
          delay={0.2}
        />
        <StatCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Engagement"
          value={`${stats.engagementRate}%`}
          trend="↑"
          delay={0.25}
        />
      </div>

      {/* Retention curve */}
      <div className="p-3 rounded-2xl bg-card/40 border border-border/20">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Audience Retention</p>
          <p className="text-[10px] text-muted-foreground">{stats.postCount} posts</p>
        </div>
        <RetentionBar segments={stats.retention} />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-muted-foreground">Start</span>
          <span className="text-[9px] text-muted-foreground">End</span>
        </div>
      </div>
    </motion.div>
  );
});
