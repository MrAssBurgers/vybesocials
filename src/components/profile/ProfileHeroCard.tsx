import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Settings, Share2, MessageCircle, MoreHorizontal, Crown } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { FriendButton } from '@/components/friends/FriendButton';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { ModBadge } from '@/components/ui/ModBadge';
import { BadgeRow } from '@/components/badges';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { UpgradeButton } from '@/components/premium/UpgradeButton';
import { GiftPremiumButton } from '@/components/premium/GiftPremiumButton';
import { useCreateConversation } from '@/hooks/useMessages';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ModeratorMenuItems } from '@/components/moderation/ModeratorActionsMenu';
import { PremiumMemeBanMenuItem } from '@/components/premium/PremiumMemeBanItems';
import { useUserStatusById } from '@/hooks/useUserStatus';
import { VybeScore } from '@/components/profile/VybeScore';
import { useUserAbout } from '@/hooks/useUserAbout';

function calcAge(birthday?: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

interface ProfileHeroCardProps {
  profile: any;
  isOwnProfile: boolean;
  isPremium: boolean;
  profileRole: any;
  isModOrAdmin: boolean;
  liveFollowerCount: number;
  displayBadges: any[];
  nameColor?: string;
  effectClass?: string;
  frameClass?: string;
  lockerData?: any;
  badgeSettings: any;
  onFollow: () => void;
  isFollowPending: boolean;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onWarnClick: () => void;
  onBanClick: () => void;
  onMemeBanClick: () => void;
  onPremiumMemeBanClick: () => void;
}

export function ProfileHeroCard({
  profile,
  isOwnProfile,
  isPremium,
  profileRole,
  isModOrAdmin,
  liveFollowerCount,
  displayBadges,
  nameColor,
  effectClass,
  frameClass,
  lockerData,
  badgeSettings,
  onFollow,
  isFollowPending,
  onAvatarChange,
  onWarnClick,
  onBanClick,
  onMemeBanClick,
  onPremiumMemeBanClick,
}: ProfileHeroCardProps) {
  const navigate = useNavigate();
  const createConversation = useCreateConversation();
  const { data: status } = useUserStatusById(profile?.id);
  const { data: about } = useUserAbout(profile?.id);
  const birthday = profile?.date_of_birth || profile?.birthday;
  const age = about?.show_age ? calcAge(birthday) : null;
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const showOwnerBadge = badgeSettings.show_owner_badge !== false;
  const showOwnerWifeBadge = badgeSettings.show_owner_wife_badge !== false;
  const showModBadge = badgeSettings.show_mod_badge !== false;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
    setTilt({ x, y });
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const conversation = await createConversation.mutateAsync({ memberIds: [profile.id] });
      navigate(`/messages/${conversation.id}`);
    } catch { toast.error('Failed to start conversation'); }
  };

  const handleShare = async () => {
    const { buildProfileShareUrl } = await import('@/lib/shareLinks');
    const url = buildProfileShareUrl(profile.username);
    if (navigator.share) {
      navigator.share({ title: `${profile.display_name || profile.username} on VYBE`, url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Profile link copied!');
    }
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      style={{
        transform: `perspective(800px) rotateX(${tilt.y}deg) rotateY(${tilt.x}deg)`,
        transition: 'transform 0.15s ease-out',
      }}
      className="relative rounded-3xl overflow-hidden border border-border/30"
    >
      {/* Card background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/5 to-secondary/20 backdrop-blur-xl" />
      <div className="absolute inset-0 bg-card/20" />

      <div className="relative p-4 pb-4 sm:p-5">
        {/* Top row: Avatar + identity + actions */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Avatar */}
          <div className="relative group flex-shrink-0">
            <div className={cn(
              "p-[3px] rounded-2xl transition-all duration-500",
              frameClass || "bg-gradient-to-br from-primary via-accent to-primary"
            )}>
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-background">
                <AvatarImage src={profile.avatar_url || undefined} className="rounded-xl" />
                <AvatarFallback className="text-xl sm:text-2xl bg-secondary rounded-xl">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            {isOwnProfile && (
              <label className="absolute inset-0 flex items-center justify-center rounded-2xl cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40">
                <Camera className="h-5 w-5 text-foreground/80" strokeWidth={1.5} />
                <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" />
              </label>
            )}
          </div>

          {/* Identity (name + meta) */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-1 flex-wrap">
              <h1 className={cn("text-lg sm:text-xl font-bold leading-tight truncate min-w-0 max-w-full", effectClass)}>
                <StyledUsername
                  userId={profile.id}
                  username={profile.username}
                  displayName={profile.display_name}
                  preferDisplayName={!!profile.display_name}
                  className="text-lg sm:text-xl font-bold"
                  nameColorOverride={nameColor}
                />
              </h1>
              {showOwnerBadge && isOwner(profile.username) && <OwnerBadge />}
              {showOwnerWifeBadge && isOwnerWife(profile.id) && <OwnerWifeRingBadge />}
              {showModBadge && profileRole && <ModBadge role={profileRole} />}
            </div>

            {/* Handle · age */}
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {profile.display_name ? <>@{profile.username}</> : <>&nbsp;</>}
              {profile.display_name && age !== null ? <span className="opacity-50"> · </span> : null}
              {age !== null && <span className="font-medium text-foreground/70">{age}</span>}
            </p>

            {/* Status pill — compact, inline under handle */}
            {status && (
              <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/20 text-[11px] font-medium text-foreground/80 max-w-full"
              >
                <span>{status.emoji}</span>
                <span className="truncate">{status.text}</span>
              </motion.span>
            )}
          </div>

          {/* Action buttons - inline icons (own profile) or dropdown (mod) */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isOwnProfile ? (
              <>
                <Link to="/settings">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-foreground/5 hover:bg-foreground/10">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-foreground/5 hover:bg-foreground/10" onClick={handleShare}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              isModOrAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg bg-foreground/5 hover:bg-foreground/10">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="liquid-glass">
                    <DropdownMenuLabel className="flex items-center gap-2">
                      @{profile.username}
                      {profileRole && <ModBadge role={profileRole} showLabel />}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <ModeratorMenuItems
                      userId={profile.id}
                      username={profile.username}
                      onWarnClick={onWarnClick}
                      onBanClick={onBanClick}
                      onMemeBanClick={onMemeBanClick}
                    />
                    <PremiumMemeBanMenuItem
                      userId={profile.id}
                      username={profile.username}
                      onOpen={onPremiumMemeBanClick}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            )}
          </div>
        </div>

        {/* Full-width chip strip — vybe score · title · badges. Horizontally scrolls if overflow. */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          <VybeScore profileId={profile.id} isOwnProfile={isOwnProfile} />
          {lockerData?.equippedTitle && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary h-6 flex-shrink-0">
              {lockerData.equippedTitle}
            </span>
          )}
          {displayBadges.length > 0 && (
            <div className="flex-shrink-0">
              <BadgeRow badges={displayBadges} maxVisible={3} size="sm" />
            </div>
          )}
        </div>

        {/* Stats capsules row */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-4 overflow-x-auto no-scrollbar">
          <StatCapsule value={profile.post_count} label="Posts" />
          <StatCapsule value={liveFollowerCount} label="Followers" highlight />
          <StatCapsule value={profile.following_count} label="Following" />
        </div>

        {/* Primary actions row — clean, full-width on mobile, matches desktop */}
        {!isOwnProfile && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              variant={profile.is_following ? 'secondary' : 'default'}
              size="sm"
              className={cn(
                "flex-1 h-10 rounded-xl text-sm font-semibold",
                !profile.is_following && "bg-primary text-primary-foreground"
              )}
              onClick={onFollow}
              disabled={isFollowPending}
            >
              {profile.is_following ? 'Following' : 'Follow'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-10 rounded-xl text-sm font-semibold gap-1.5"
              onClick={handleMessage}
              disabled={createConversation.isPending}
            >
              <MessageCircle className="h-4 w-4" />
              Message
            </Button>
            <FriendButton userId={profile.id} size="sm" />
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-foreground/5 hover:bg-foreground/10 flex-shrink-0" onClick={handleShare}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatCapsule({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors",
        highlight
          ? "bg-primary/15 border border-primary/25 text-primary"
          : "bg-foreground/5 border border-border/20 text-foreground/80"
      )}
    >
      <span className="font-bold text-sm">{value}</span>
      <span className="text-muted-foreground text-[10px] uppercase tracking-wider">{label}</span>
    </motion.div>
  );
}
