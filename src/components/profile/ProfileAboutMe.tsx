import { motion } from 'framer-motion';
import { MapPin, Heart, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MutualFriendsDisplay } from '@/components/profile/MutualFriendsDisplay';

interface ProfileAboutMeProps {
  bio?: string | null;
  profile: any;
  isOwnProfile: boolean;
}

const INTEREST_COLORS = [
  'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'bg-violet-500/15 text-violet-400 border-violet-500/20',
  'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'bg-rose-500/15 text-rose-400 border-rose-500/20',
  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'bg-orange-500/15 text-orange-400 border-orange-500/20',
];

export function ProfileAboutMe({ bio, profile, isOwnProfile }: ProfileAboutMeProps) {
  const interests = profile.interests || [];
  const location = profile.location;

  if (!bio && interests.length === 0 && !location && isOwnProfile) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-3"
    >
      {/* Bio block */}
      {bio && (
        <div className="rounded-2xl bg-card/60 border border-border/20 backdrop-blur-sm p-4">
          <p className="text-sm text-foreground/90 leading-relaxed">{bio}</p>
        </div>
      )}

      {/* Info pills row */}
      {(interests.length > 0 || location) && (
        <div className="flex flex-wrap gap-1.5">
          {location && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-foreground/5 border border-border/20 text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
          {interests.map((tag: string, i: number) => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border",
                INTEREST_COLORS[i % INTEREST_COLORS.length]
              )}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {tag}
            </motion.span>
          ))}
        </div>
      )}

      {/* Mutual friends */}
      {!isOwnProfile && (
        <MutualFriendsDisplay targetUserId={profile.id} variant="compact" />
      )}
    </motion.div>
  );
}
