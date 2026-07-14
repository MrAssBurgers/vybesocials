import { useMemo, useState } from 'react';
import { ArrowLeft, Cake, MapPin, MoreHorizontal, Share2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { cn } from '@/lib/utils';
import { THEME_GRADIENTS, THEME_IMAGES } from '@/lib/cosmeticConstants';
import { buildProfileShareUrl } from '@/lib/shareLinks';
import { toast } from 'sonner';
import type { ProfileViewCounts, ProfileViewProfile } from '../types';

type StatKey = keyof ProfileViewCounts;

interface ProfileCoverHeroProps {
  profile: ProfileViewProfile;
  coverThemeId?: string | null;
  coverImageUrl?: string | null;
  counts: ProfileViewCounts;
  showBio?: boolean;
  showLocation?: boolean;
  showBirthday?: boolean;
  showPronouns?: boolean;
  showFriendsStat?: boolean;
  hasStory?: boolean;
  hasUnviewedStory?: boolean;
  isOnline?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  onStatClick?: (stat: StatKey) => void;
  onBioMore?: () => void;
  onMore?: () => void;
  onAvatarClick?: () => void;
  onStoryClick?: () => void;
  className?: string;
}

function formatBorn(birthday?: string | null): string | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  return `Born ${b.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function formatProfileStat(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(n);
}

export function ProfileCoverHero({
  profile,
  coverThemeId,
  coverImageUrl,
  counts,
  showBio = true,
  showLocation = false,
  showBirthday = false,
  showPronouns = false,
  showFriendsStat = true,
  hasStory = false,
  hasUnviewedStory = false,
  isOnline = false,
  isVerified = false,
  isPremium = false,
  onStatClick,
  onBioMore,
  onMore,
  onAvatarClick,
  onStoryClick,
  className,
}: ProfileCoverHeroProps) {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [bioExpanded, setBioExpanded] = useState(false);

  const coverStyle = useMemo(() => {
    if (coverImageUrl) {
      return {
        backgroundImage: `url(${coverImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } as const;
    }
    if (coverThemeId && THEME_IMAGES[coverThemeId]) {
      return {
        backgroundImage: `url(${THEME_IMAGES[coverThemeId]})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } as const;
    }
    if (coverThemeId && THEME_GRADIENTS[coverThemeId]) {
      return { backgroundImage: THEME_GRADIENTS[coverThemeId] } as const;
    }
    return {
      backgroundImage:
        'linear-gradient(180deg, hsl(var(--primary) / 0.35) 0%, hsl(var(--card)) 100%)',
    } as const;
  }, [coverImageUrl, coverThemeId]);

  const displayName = profile.display_name || profile.username;
  const bio = showBio ? (profile.bio || '').trim() : '';
  const bioLong = bio.length > 80 || bio.split('\n').length > 2;
  const born = showBirthday ? formatBorn(profile.date_of_birth) : null;

  const handleShare = async () => {
    const url = buildProfileShareUrl(profile.username);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${displayName} on VYBE`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied');
      }
    } catch {
      /* cancelled */
    }
  };

  const stats: { key: StatKey; label: string; value: number }[] = [
    { key: 'posts', label: 'Posts', value: counts.posts },
    { key: 'followers', label: 'Followers', value: counts.followers },
    { key: 'following', label: 'Following', value: counts.following },
    ...(showFriendsStat ? [{ key: 'friends' as StatKey, label: 'Friends', value: counts.friends }] : []),
  ];

  const avatarRingClass = hasStory
    ? cn(
        'vybe-profile-story-ring',
        !hasUnviewedStory && 'vybe-profile-story-ring--seen',
      )
    : 'rounded-full ring-2 ring-border/60';

  return (
    <div className={cn('vybe-profile-chrome', className)}>
      <div
        className="relative overflow-hidden rounded-b-none"
        style={{ ...coverStyle, height: 'var(--vp-cover-h)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[hsl(var(--card))]" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 py-2">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
              onClick={() => void handleShare()}
              aria-label="Share profile"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/50"
              onClick={onMore}
              aria-label="More"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="vybe-profile-surface relative z-10 -mt-10 px-4 pt-0">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3"
        >
          <button
            type="button"
            onClick={hasStory ? onStoryClick : onAvatarClick}
            className={cn('relative shrink-0', avatarRingClass)}
            aria-label={hasStory ? 'View story' : 'Profile photo'}
          >
            <Avatar className="h-[4.25rem] w-[4.25rem] border-[3px] border-background">
              <AvatarImage src={profile.avatar_url || undefined} alt={displayName} />
              <AvatarFallback className="text-lg font-bold">
                {displayName.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isOnline && !hasStory && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-500" />
            )}
          </button>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <h1 className="truncate text-base font-bold tracking-tight">{displayName}</h1>
              {isVerified && (
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-black"
                  title="Verified"
                >
                  <Star className="h-2.5 w-2.5 fill-current" />
                </span>
              )}
              {isPremium && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary">
                  VYBE+
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              <StyledUsername userId={profile.id} username={profile.username} showAtSymbol />
            </p>

            {bio ? (
              <div className="mt-1">
                <p
                  className={cn(
                    'whitespace-pre-wrap text-xs leading-snug text-foreground/90',
                    !bioExpanded && 'line-clamp-2',
                  )}
                >
                  {bio}
                </p>
                {bioLong && (
                  <button
                    type="button"
                    className="text-[11px] font-semibold text-primary"
                    onClick={() => {
                      if (bioExpanded) setBioExpanded(false);
                      else if (onBioMore) onBioMore();
                      else setBioExpanded(true);
                    }}
                  >
                    {bioExpanded ? 'Less' : 'More'}
                  </button>
                )}
              </div>
            ) : null}

            {(showPronouns && profile.pronouns) ||
            (showLocation && profile.location) ||
            born ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-muted-foreground">
                {showPronouns && profile.pronouns ? <span>{profile.pronouns}</span> : null}
                {showLocation && profile.location ? (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="h-2.5 w-2.5" />
                    {profile.location}
                  </span>
                ) : null}
                {born ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Cake className="h-2.5 w-2.5" />
                    {born}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </motion.div>

        <div className="vybe-profile-stat-rail mt-2 py-1.5">
          {stats.map((stat) => (
            <button
              key={stat.key}
              type="button"
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-0.5 transition-colors hover:bg-muted/25"
              onClick={() => onStatClick?.(stat.key)}
            >
              <p className="text-sm font-bold tabular-nums leading-none">
                {formatProfileStat(stat.value)}
              </p>
              <p className="truncate text-[9px] text-muted-foreground">{stat.label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
