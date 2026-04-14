import { memo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, TrendingUp, Users } from 'lucide-react';
import { liquidSpring } from '@/motion/liquidConfig';

const REWARD_TYPES = [
  { icon: TrendingUp, text: '🔥 This post is trending in your area', gradient: 'from-orange-500/15 to-amber-500/10', iconColor: 'text-orange-500' },
  { icon: Sparkles, text: '✨ You've scrolled 10 posts — here's something special', gradient: 'from-violet-500/15 to-fuchsia-500/10', iconColor: 'text-violet-500' },
  { icon: Users, text: '👀 Your friends are loving this post', gradient: 'from-blue-500/15 to-cyan-500/10', iconColor: 'text-blue-500' },
];

export const FeedRewardCard = memo(function FeedRewardCard({ index }: { index: number }) {
  const reward = REWARD_TYPES[index % REWARD_TYPES.length];
  const Icon = reward.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={liquidSpring}
      className={`rounded-2xl bg-gradient-to-r ${reward.gradient} border border-white/[0.08] p-4 flex items-center gap-3 my-2`}
    >
      <div className={`w-10 h-10 rounded-full bg-background/60 flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${reward.iconColor}`} />
      </div>
      <p className="text-sm font-medium text-foreground/90">{reward.text}</p>
    </motion.div>
  );
});
