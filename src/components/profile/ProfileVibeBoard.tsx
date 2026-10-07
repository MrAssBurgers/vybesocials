import { memo } from 'react';
import { motion } from 'framer-motion';
import { Dna, Users, Music, Gamepad2, BookOpen, Tv } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVybeDNA } from '@/hooks/useVybeDNA';
import { useUserBadges } from '@/hooks/useBadges';
import { BadgeRow } from '@/components/badges';
import { EngagementScore } from '@/components/profile/EngagementScore';

interface ProfileVibeBoardProps {
  userId: string;
  isOwnProfile: boolean;
  postCount: number;
  postCountExact?: boolean;
  followCountsExact?: boolean;
  followerCount: number;
  followingCount: number;
}

const CARD_COLORS = [
  'from-violet-500/10 to-fuchsia-500/10 border-violet-500/15',
  'from-cyan-500/10 to-blue-500/10 border-cyan-500/15',
  'from-amber-500/10 to-orange-500/10 border-amber-500/15',
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const cardAnim = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export const ProfileVibeBoard = memo(function ProfileVibeBoard({
  userId,
  isOwnProfile,
  postCount,
  postCountExact = false,
  followCountsExact = false,
  followerCount,
  followingCount,
}: ProfileVibeBoardProps) {
  const { data: dna } = useVybeDNA(userId);
  const { data: badges } = useUserBadges(userId);

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-3"
    >
      {/* VYBE DNA Card */}
      <motion.div variants={cardAnim}>
        <VibeBoardCard
          title="VYBE DNA"
          icon={Dna}
          colorClass={CARD_COLORS[0]}
        >
          {dna ? (
            <div className="flex items-center gap-4">
              {/* Color dots */}
              <div className="flex gap-1.5">
                {(dna.signature_colors || []).slice(0, 3).map((c: string, i: number) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.1, type: 'spring', stiffness: 300 }}
                    className="w-8 h-8 rounded-lg shadow-lg"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold capitalize">{dna.glyph_pattern || 'wave'}</p>
                <p className="text-[11px] text-muted-foreground">
                  Engagement · {Math.round((dna.engagement_score || 0) * 100)}%
                </p>
              </div>
              <EngagementScore
                postCount={postCount}
                available={postCountExact && followCountsExact}
                followerCount={followerCount}
                followingCount={followingCount}
                className="hidden sm:flex"
              />
            </div>
          ) : null}
        </VibeBoardCard>
      </motion.div>

      {/* Badges Card */}
      {badges && badges.length > 0 && (
        <motion.div variants={cardAnim}>
          <VibeBoardCard
            title="Badges"
            icon={Users}
            colorClass={CARD_COLORS[1]}
          >
            <BadgeRow badges={badges.slice(0, 8).map((b: any) => b.badge || b) as any} size="sm" />
          </VibeBoardCard>
        </motion.div>
      )}

      {/* Engagement on mobile */}
      <motion.div variants={cardAnim} className="sm:hidden">
        <VibeBoardCard
          title="Engagement"
          icon={Music}
          colorClass={CARD_COLORS[2]}
        >
          <EngagementScore
            postCount={postCount}
            available={postCountExact && followCountsExact}
            followerCount={followerCount}
            followingCount={followingCount}
          />
        </VibeBoardCard>
      </motion.div>
    </motion.div>
  );
});

function VibeBoardCard({
  title,
  icon: Icon,
  colorClass,
  children,
}: {
  title: string;
  icon: any;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-2xl border backdrop-blur-sm p-4 bg-gradient-to-br",
      colorClass,
    )}>
      <div className="flex items-center gap-1.5 mb-3">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}
