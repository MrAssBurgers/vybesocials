import { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, LockKeyhole, MoreHorizontal, Share2, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { MutualFriendsDisplay } from '@/components/profile/MutualFriendsDisplay';
import { cn } from '@/lib/utils';
import { useUserOnlineStatus } from '@/hooks/usePresence';
import { buildProfileShareUrl } from '@/lib/shareLinks';
import { toast } from 'sonner';

export type SocialProfileMode =
  | 'friend'
  | 'pending-sent'
  | 'pending-received'
  | 'public';

interface SocialProfileHeroProps {
  profile: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    bio?: string | null;
    is_private?: boolean | null;
    is_verified?: boolean | null;
  };
  mode: SocialProfileMode;
  showBio: boolean;
  showMutualFriends: boolean;
  showOnline?: boolean;
  themeGradient?: string;
  onMoreMenu: () => void;
}

const MODE_LABELS: Record<SocialProfileMode, string> = {
  friend: 'Friends',
  'pending-sent': 'Request sent',
  'pending-received': 'Wants to connect',
  public: 'Public profile',
};

export const SocialProfileHero = memo(function SocialProfileHero({
  profile,
  mode,
  showBio,
  showMutualFriends,
  showOnline = false,
  themeGradient,
  onMoreMenu,
}: SocialProfileHeroProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { data: presence } = useUserOnlineStatus(showOnline ? profile.id : undefined);

  const shareProfile = async () => {
    const url = buildProfileShareUrl(profile.username);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${profile.display_name || profile.username} on VYBE`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') toast.error('Could not share profile');
    }
  };

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      className="relative overflow-hidden rounded-3xl border border-border/40 bg-card/80 p-4 shadow-lg backdrop-blur-xl"
      style={themeGradient ? { backgroundImage: themeGradient } : undefined}
    >
      {themeGradient && (
        <div className="pointer-events-none absolute inset-0 bg-background/75 backdrop-blur-sm" />
      )}

      <div className="relative flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <Avatar
          className="h-20 w-20 shrink-0 ring-2 ring-primary/30"
          data-profile-id={profile.id}
          data-avatar-url={profile.avatar_url || undefined}
        >
          <AvatarImage
            src={profile.avatar_url || undefined}
            alt={`${profile.display_name || profile.username}'s avatar`}
          />
          <AvatarFallback className="bg-primary/15 text-2xl">
            {profile.username[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {showOnline && presence?.is_online && (
          <span
            className="absolute left-[6.2rem] top-[4.15rem] h-4 w-4 rounded-full border-2 border-background bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.8)]"
            aria-label="Online"
          />
        )}

        <div className="min-w-0 flex-1 pt-1">
          <h1 className="flex items-center gap-1 truncate text-xl font-bold">
            <span className="truncate">{profile.display_name || profile.username}</span>
            {profile.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified" />}
          </h1>
          <StyledUsername
            userId={profile.id}
            username={profile.username}
            className="text-sm text-muted-foreground"
          />
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
            {profile.is_private && mode === 'public' ? (
              <LockKeyhole className="h-3 w-3" />
            ) : (
              <Users className="h-3 w-3" />
            )}
            {profile.is_private && mode === 'public' ? 'Private profile' : MODE_LABELS[mode]}
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={() => void shareProfile()}
            aria-label="Share profile"
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full"
            onClick={onMoreMenu}
            aria-label="Profile options"
          >
            <MoreHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {showBio && profile.bio && (
        <p className="relative mt-4 whitespace-pre-wrap text-sm text-foreground/85">
          {profile.bio}
        </p>
      )}

      {showMutualFriends && (
        <div className={cn('relative mt-3', !showBio && !profile.bio && 'mt-4')}>
          <MutualFriendsDisplay targetUserId={profile.id} variant="compact" />
        </div>
      )}
    </motion.section>
  );
});
