import { motion } from 'framer-motion';
import { Zap, TrendingUp, Heart, MessageCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EngagementScoreProps {
  postCount: number;
  followerCount: number;
  followingCount: number;
  className?: string;
}

/**
 * Calculate engagement score from profile stats
 * Formula: weighted combination of activity signals
 */
function calculateScore(posts: number, followers: number, following: number): number {
  if (posts === 0 && followers === 0) return 0;
  
  // Base score from post volume
  const postScore = Math.min(posts * 10, 300);
  
  // Follower ratio (high followers relative to following = more influential)
  const ratio = following > 0 ? followers / following : followers;
  const ratioScore = Math.min(ratio * 20, 200);
  
  // Follower volume bonus
  const followerScore = Math.min(Math.sqrt(followers) * 15, 300);
  
  // Activity bonus (consistent posting)
  const activityBonus = posts >= 10 ? 100 : posts >= 5 ? 50 : posts >= 1 ? 20 : 0;
  
  const raw = postScore + ratioScore + followerScore + activityBonus;
  
  // Normalize to 0-100 scale with diminishing returns
  return Math.min(Math.round((1 - Math.exp(-raw / 400)) * 100), 100);
}

function getScoreLabel(score: number): { label: string; color: string; icon: typeof Zap } {
  if (score >= 80) return { label: 'On Fire', color: 'text-orange-400', icon: Zap };
  if (score >= 60) return { label: 'Rising', color: 'text-emerald-400', icon: TrendingUp };
  if (score >= 40) return { label: 'Active', color: 'text-blue-400', icon: Heart };
  if (score >= 20) return { label: 'Growing', color: 'text-purple-400', icon: Eye };
  return { label: 'New', color: 'text-muted-foreground', icon: MessageCircle };
}

export function EngagementScore({ postCount, followerCount, followingCount, className }: EngagementScoreProps) {
  const score = calculateScore(postCount, followerCount, followingCount);
  const { label, color, icon: Icon } = getScoreLabel(score);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/60 backdrop-blur-sm border border-border/40",
        className
      )}
    >
      <div className="relative">
        {/* Circular progress ring */}
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
          <circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="3"
          />
          <motion.circle
            cx="18" cy="18" r="14"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 14}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 14 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 14 * (1 - score / 100) }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-foreground">
          {score}
        </span>
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <Icon className={cn("h-3 w-3", color)} />
          <span className={cn("text-xs font-semibold", color)}>{label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground leading-none">Engagement</span>
      </div>
    </motion.div>
  );
}
