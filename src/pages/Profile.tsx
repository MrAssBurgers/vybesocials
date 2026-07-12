import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Grid, Film, Bookmark, Package, Play, Pin } from 'lucide-react';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { useProfileByUsername, useFollow, useUpdateAvatar } from '@/hooks/useProfile';
import { usePosts } from '@/hooks/usePosts';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAppBackground } from '@/components/layout/AppBackground';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipsGrid } from '@/components/posts/ClipsGrid';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useMarkConversationReadByUser } from '@/hooks/useMessages';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { GuestJoinBanner } from '@/components/growth/GuestJoinBanner';
import { useIsModOrAdmin, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { PremiumMemeBanDialog } from '@/components/premium/PremiumMemeBanItems';
import { useLiveFollowerCount } from '@/hooks/useLiveFollowerCount';
import { useUserBadges, useUserPrimaryBadge } from '@/hooks/useBadges';
import { ProfileLocker } from '@/components/profile/ProfileLocker';
import { useLockerItems } from '@/hooks/useLockerItems';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

import { ProfileHeroCard } from '@/components/profile/ProfileHeroCard';
import { ProfileAboutMe } from '@/components/profile/ProfileAboutMe';
import { ProfileAboutDetails } from '@/components/profile/ProfileAboutDetails';
import { ProfileVibeBoard } from '@/components/profile/ProfileVibeBoard';
import { NowPlayingCard } from '@/components/music/NowPlayingCard';
import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';

import {
  NAME_COLOR_MAP, THEME_GRADIENTS, THEME_IMAGES, THEME_ACCENTS,
  EFFECT_CLASS_MAP_INTENSE as EFFECT_CLASS_MAP,
  FRAME_CLASS_MAP,
} from '@/lib/cosmeticConstants';

export default function ProfilePage() {
  const { username, usernameOrId } = useParams<{ username?: string; usernameOrId?: string }>();
  const navigate = useNavigate();
  const { profile: currentProfile } = useAuth();
  const resolvedUsername = username || usernameOrId || currentProfile?.username;
  const { data: profile, isPending: profilePending, isError: profileError, refetch: refetchProfile } = useProfileByUsername(resolvedUsername!);
  const { data: posts } = usePosts(undefined, profile?.id, { enabled: !!profile?.id });
  const { data: savedPosts } = useSavedPosts();
  const follow = useFollow();
  const updateAvatar = useUpdateAvatar();
  const markConversationReadByUser = useMarkConversationReadByUser();
  const [activeTab, setActiveTab] = useState('posts');
  const { data: profileRole } = useUserRoleById(profile?.id);
  const isModOrAdmin = useIsModOrAdmin();
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  const [premiumMemeBanOpen, setPremiumMemeBanOpen] = useState(false);
  const { isPremium } = usePremiumStatus();

  const liveFollowerCount = useLiveFollowerCount(profile?.id);
  const { data: userBadges } = useUserBadges(profile?.id);
  const { data: primaryBadge } = useUserPrimaryBadge(profile?.id);
  const { data: lockerData } = useLockerItems(profile?.id);

  const equippedTheme = lockerData?.equippedProfileTheme;
  const { setBackgroundImage, refreshBackground } = useAppBackground();

  // Apply the VIEWED profile's custom background while on this page.
  // For the OWN profile, AppBackgroundProvider already applies it globally,
  // so we skip here. When viewing another user, override and then restore the
  // logged-in user's own background on unmount.
  useEffect(() => {
    if (!profile?.id) return;
    const isOwn = !!currentProfile && currentProfile.id === profile.id;
    if (isOwn) return; // provider handles it globally

    let cancelled = false;
    const apply = async () => {
      const themeImg = equippedTheme ? THEME_IMAGES[equippedTheme] : null;
      if (themeImg) {
        const img = new Image();
        img.onload = () => { if (!cancelled) setBackgroundImage(themeImg); };
        img.src = themeImg;
        return;
      }
      try {
        const { db } = await import('@/lib/firebase');
        const { data } = await db
          .from('user_backgrounds')
          .select('image_url')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .maybeSingle();
        if (!cancelled) setBackgroundImage(data?.image_url ?? null);
      } catch {
        if (!cancelled) setBackgroundImage(null);
      }
    };
    apply();
    return () => {
      cancelled = true;
      // Restore the logged-in user's own background
      refreshBackground();
    };
  }, [profile?.id, currentProfile?.id, equippedTheme, setBackgroundImage, refreshBackground]);

  const isOwnProfile = !!currentProfile && !!profile && currentProfile.id === profile.id;

  const badgeSettings = (profile as any)?.badge_settings || {};

  const equippedBadge = lockerData?.equippedBadgeId
    ? userBadges?.find(ub => ub.badge_id === lockerData.equippedBadgeId)
    : null;

  const displayBadges = equippedBadge ? [{
    id: equippedBadge.badge.id,
    icon: equippedBadge.badge.icon,
    name: equippedBadge.badge.name,
    description: equippedBadge.badge.description,
    gradient_from: equippedBadge.badge.gradient_from,
    gradient_to: equippedBadge.badge.gradient_to,
    effect: equippedBadge.badge.effect,
    is_animated: equippedBadge.badge.is_animated,
  }] : [];

  useEffect(() => {
    if (profile?.id && currentProfile?.id && profile.id !== currentProfile.id) {
      markConversationReadByUser.mutate(profile.id);
    }
  }, [profile?.id, currentProfile?.id]);

  const nameColor = lockerData?.equippedNameColor ? NAME_COLOR_MAP[lockerData.equippedNameColor] : undefined;
  const effectClass = lockerData?.equippedEffect ? EFFECT_CLASS_MAP[lockerData.equippedEffect] : undefined;
  const frameClass = lockerData?.equippedFrame ? FRAME_CLASS_MAP[lockerData.equippedFrame] : undefined;
  const themeGradient = lockerData?.equippedProfileTheme ? THEME_GRADIENTS[lockerData.equippedProfileTheme] : undefined;
  const themeImage = lockerData?.equippedProfileTheme ? THEME_IMAGES[lockerData.equippedProfileTheme] : undefined;

  const handleFollow = async () => {
    if (!profile) return;
    try {
      await follow.mutateAsync({ targetId: profile.id, isFollowing: profile.is_following });
      toast.success(profile.is_following ? 'Unfollowed' : 'Following!');
    } catch { toast.error('Something went wrong'); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await updateAvatar.mutateAsync(file);
      toast.success('Avatar updated!');
    } catch { toast.error('Failed to update avatar'); }
  };

  const gridPosts = posts?.filter((p) => p.type === 'post' || p.type === 'video') || [];
  const shortPosts = posts?.filter((p) => p.type === 'short') || [];
  const clipsForGrid = shortPosts.map(post => ({
    id: post.id,
    media_url: post.media_url,
    thumbnail_url: (post as any).thumbnail_url ?? null,
    caption: post.caption || '',
    tags: post.tags || [],
    author: post.author,
    like_count: post.like_count,
    comment_count: post.comment_count,
    is_liked: post.is_liked,
    is_bookmarked: post.is_bookmarked,
    view_count: post.view_count || 0,
  }));

  if (profilePending && !profile) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-44 w-full rounded-3xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (profileError) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <p className="text-muted-foreground">Couldn&apos;t load this profile</p>
          <Button variant="outline" onClick={() => refetchProfile()}>Retry</Button>
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96 space-y-4">
          <p className="text-6xl mb-2">😕</p>
          <h2 className="text-xl font-semibold">Profile not found</h2>
          <p className="text-muted-foreground text-center max-w-sm">
            This user doesn't exist or their profile is unavailable.
          </p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
            <Button onClick={() => navigate('/home')}>Go Home</Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const tabs = [
    { id: 'posts', label: 'Posts', icon: Grid },
    { id: 'shorts', label: 'Clips', icon: Film },
    ...(isOwnProfile ? [
      { id: 'locker', label: 'Locker', icon: Package },
      { id: 'saved', label: 'Saved', icon: Bookmark },
    ] : []),
  ];

  return (
    <AppLayout>
      {(themeImage || themeGradient) && (
        <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
          {!themeImage && themeGradient && (
            <div className="absolute inset-0" style={{ background: themeGradient }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/70" />
        </div>
      )}

      <div className="max-w-lg mx-auto px-3 sm:px-4 py-4 pb-[calc(7rem+env(safe-area-inset-bottom))] relative min-h-screen space-y-4" style={{ zIndex: 1 }}>
        {/* Hero Identity Card */}
        <ProfileHeroCard
          profile={profile}
          isOwnProfile={isOwnProfile}
          isPremium={isPremium}
          profileRole={profileRole}
          isModOrAdmin={isModOrAdmin}
          liveFollowerCount={liveFollowerCount}
          displayBadges={displayBadges}
          nameColor={nameColor}
          effectClass={effectClass}
          frameClass={frameClass}
          lockerData={lockerData}
          badgeSettings={badgeSettings}
          onFollow={handleFollow}
          isFollowPending={follow.isPending}
          onAvatarChange={handleAvatarChange}
          onWarnClick={() => setWarnDialogOpen(true)}
          onBanClick={() => setBanDialogOpen(true)}
          onMemeBanClick={() => setMemeBanDialogOpen(true)}
          onPremiumMemeBanClick={() => setPremiumMemeBanOpen(true)}
        />

        {/* About Me */}
        <ProfileAboutMe
          bio={profile.bio}
          profile={profile}
          isOwnProfile={isOwnProfile}
        />

        {/* Now Playing (Spotify) */}
        <NowPlayingCardWrapper authUserId={(profile as any).user_id} />

        {/* About Details (MBTI, height, music, etc.) */}
        <ProfileAboutDetails
          profileId={profile.id}
          birthday={(profile as any).date_of_birth || (profile as any).birthday}
        />

        {/* Vibe Board */}
        <ProfileVibeBoard
          userId={profile.id}
          isOwnProfile={isOwnProfile}
          postCount={profile.post_count || 0}
          followerCount={liveFollowerCount || 0}
          followingCount={profile.following_count || 0}
        />

        {/* Pill Tab Selector */}
        <div className="flex gap-1.5 p-1 rounded-2xl bg-card/60 border border-border/20 backdrop-blur-sm relative">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors duration-200 relative",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="profile-tab-indicator"
                    className="absolute inset-0 rounded-xl bg-primary/15 border border-primary/25 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className="h-3.5 w-3.5 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px]">
          {activeTab === 'posts' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {gridPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {gridPosts.map((post, idx) => (
                    <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.04, duration: 0.3 }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="aspect-square overflow-hidden bg-muted rounded-2xl ring-1 ring-border/10"
                      >
                        {post.type === 'video' ? (
                          <>
                            <VideoThumbnail
                              videoUrl={post.media_url}
                              thumbnailUrl={post.thumbnail_url}
                              alt={post.caption || 'Video'}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
                              <Play className="h-3 w-3 text-foreground" fill="currentColor" />
                            </div>
                          </>
                        ) : (
                          <ProfileGridImage url={post.media_url} alt={post.caption || ''} />
                        )}
                        {post.is_pinned && (
                          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-black/55 backdrop-blur-sm ring-1 ring-foreground/10">
                            <Pin className="h-3 w-3 text-foreground" fill="currentColor" />
                          </div>
                        )}
                      </motion.div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-2xl">
                        <span className="font-semibold text-foreground text-sm">❤️ {post.like_count}</span>
                        <span className="font-semibold text-foreground text-sm">💬 {post.comment_count}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState emoji="📷" title="No posts yet" />
              )}
            </motion.div>
          )}

          {activeTab === 'shorts' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <ClipsGrid clips={clipsForGrid} />
            </motion.div>
          )}

          {activeTab === 'locker' && isOwnProfile && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <ProfileLocker />
            </motion.div>
          )}

          {activeTab === 'saved' && isOwnProfile && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {savedPosts && savedPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {savedPosts.map((post, idx) => (
                    <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.04, duration: 0.3 }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="aspect-square overflow-hidden bg-muted rounded-2xl ring-1 ring-border/10"
                      >
                        {post.type === 'video' || post.type === 'short' ? (
                          <>
                            <VideoThumbnail
                              videoUrl={post.media_url}
                              thumbnailUrl={post.thumbnail_url}
                              alt={post.caption || 'Video'}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
                              <Play className="h-3 w-3 text-foreground" fill="currentColor" />
                            </div>
                          </>
                        ) : (
                          <ProfileGridImage url={post.media_url} alt={post.caption || ''} />
                        )}
                      </motion.div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-2xl">
                        <span className="font-semibold text-foreground text-sm">❤️ {post.like_count}</span>
                        <span className="font-semibold text-foreground text-sm">💬 {post.comment_count}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState emoji="🔖" title="No saved posts yet" description="Posts you save will appear here" />
              )}
            </motion.div>
          )}
        </div>

        {/* Moderator dialogs */}
        {profile && (
          <ModeratorDialogs
            userId={profile.id}
            username={profile.username}
            warnDialogOpen={warnDialogOpen}
            setWarnDialogOpen={setWarnDialogOpen}
            banDialogOpen={banDialogOpen}
            setBanDialogOpen={setBanDialogOpen}
            memeBanDialogOpen={memeBanDialogOpen}
            setMemeBanDialogOpen={setMemeBanDialogOpen}
          />
        )}
        {profile && (
          <PremiumMemeBanDialog
            userId={profile.id}
            username={profile.username}
            open={premiumMemeBanOpen}
            onOpenChange={setPremiumMemeBanOpen}
          />
        )}
      </div>
      <GuestJoinBanner context="profile" username={profile?.username} />
    </AppLayout>
  );
}

function ProfileGridImage({ url, alt }: { url: string; alt: string }) {
  const signedUrl = useSignedUrl(url);
  return <img src={signedUrl || url} alt={alt} className="w-full h-full object-cover" />;
}

function NowPlayingCardWrapper({ authUserId }: { authUserId: string | null | undefined }) {
  const presence = useLiveMusicPresence(authUserId);
  if (!presence?.is_playing) return null;
  return <NowPlayingCard presence={presence} />;
}
