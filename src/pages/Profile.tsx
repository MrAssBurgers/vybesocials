import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings, Grid, Film, Bookmark, Camera, MessageCircle, Play, MoreHorizontal, Award, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfileByUsername, useFollow, useUpdateAvatar } from '@/hooks/useProfile';
import { usePosts } from '@/hooks/usePosts';
import { useSavedPosts } from '@/hooks/useSavedPosts';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { FriendButton } from '@/components/friends/FriendButton';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { ClipsGrid } from '@/components/posts/ClipsGrid';
import { MutualFriendsDisplay } from '@/components/profile/MutualFriendsDisplay';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useCreateConversation, useMarkConversationReadByUser } from '@/hooks/useMessages';
import { ModBadge } from '@/components/ui/ModBadge';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useLiveFollowerCount } from '@/hooks/useLiveFollowerCount';
import { useUserBadges, useUserPrimaryBadge } from '@/hooks/useBadges';
import { BadgeRow } from '@/components/badges';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { ProfileLocker } from '@/components/profile/ProfileLocker';
import { useLockerItems } from '@/hooks/useLockerItems';

// ── Name color map ──────────────────────────────────────────────
const NAME_COLOR_MAP: Record<string, string> = {
  'Crimson': '#DC2626',
  'Ocean Blue': '#2563EB',
  'Emerald': '#059669',
  'Sunset Orange': '#EA580C',
  'Neon Pink': '#EC4899',
  'Ice Blue': '#06B6D4',
  'Royal Purple': '#7C3AED',
  'Toxic Green': '#84CC16',
  'Gold': '#EAB308',
  'Diamond White': '#E2E8F0',
  'Holographic': '#EC4899', // fallback solid for inline
};

// ── Profile theme gradients ─────────────────────────────────────
const THEME_GRADIENTS: Record<string, string> = {
  'Midnight': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
  'Sunset Vibes': 'linear-gradient(135deg, #9a3412 0%, #dc2626 50%, #f59e0b 100%)',
  'Arctic': 'linear-gradient(135deg, #164e63 0%, #0e7490 50%, #67e8f9 100%)',
  'Neon City': 'linear-gradient(135deg, #701a75 0%, #be185d 50%, #ec4899 100%)',
  'Inferno': 'linear-gradient(135deg, #7c2d12 0%, #dc2626 50%, #f97316 100%)',
  'Galaxy': 'linear-gradient(135deg, #1e1b4b 0%, #6d28d9 50%, #a78bfa 100%)',
  'Aurora Borealis': 'linear-gradient(135deg, #064e3b 0%, #6d28d9 40%, #06b6d4 70%, #10b981 100%)',
  'Void': 'linear-gradient(135deg, #0a0a0a 0%, #1c1917 50%, #292524 100%)',
};

// ── Effect class map ────────────────────────────────────────────
const EFFECT_CLASS_MAP: Record<string, string> = {
  'Sparkle': 'animate-[sparkle-name-intense_1.5s_ease-in-out_infinite]',
  'Rainbow Shift': 'animate-[rainbow-shift_2s_linear_infinite]',
  'Fire Trail': 'animate-[fire-glow-intense_1s_ease-in-out_infinite]',
  'Cosmic Glow': 'animate-[cosmic-glow-intense_3s_ease-in-out_infinite]',
  'Glitch': 'animate-[glitch-text_0.3s_steps(2)_infinite]',
  'Neon Pulse': 'animate-[neon-pulse_1.5s_ease-in-out_infinite]',
  'Shadow Flicker': 'animate-[shadow-flicker_0.8s_ease-in-out_infinite]',
  'Aurora Wave': 'animate-[aurora-wave_3s_ease-in-out_infinite]',
  'Electric Surge': 'animate-[electric-surge_0.5s_ease-in-out_infinite]',
  'Plasma Storm': 'animate-[plasma-storm_2s_ease-in-out_infinite]',
};

// ── Frame class map ─────────────────────────────────────────────
const FRAME_CLASS_MAP: Record<string, string> = {
  'Silver Ring': 'ring-[3px] ring-gray-400/60 shadow-[0_0_12px_2px_rgba(156,163,175,0.3)]',
  'Blue Glow': 'ring-[3px] ring-blue-400/70 shadow-[0_0_20px_4px_rgba(96,165,250,0.35)]',
  'Purple Aura': 'ring-[3px] ring-purple-500/70 shadow-[0_0_20px_4px_rgba(168,85,247,0.35)]',
  'Gold Frame': 'ring-[3px] ring-yellow-400/80 shadow-[0_0_24px_6px_rgba(250,204,21,0.35)]',
  'Diamond Frame': 'ring-[3px] ring-cyan-300/80 shadow-[0_0_28px_8px_rgba(103,232,249,0.4)] animate-[diamond-pulse_2s_ease-in-out_infinite]',
  'Neon Ring': 'ring-[3px] ring-green-400/80 shadow-[0_0_24px_6px_rgba(74,222,128,0.4)] animate-[neon-ring-pulse_2s_ease-in-out_infinite]',
  'Emerald Ring': 'ring-[3px] ring-emerald-500/70 shadow-[0_0_20px_4px_rgba(16,185,129,0.35)]',
  'Sunset Halo': 'ring-[3px] ring-orange-400/80 shadow-[0_0_24px_6px_rgba(251,146,60,0.4)] animate-[sunset-halo_3s_ease-in-out_infinite]',
  'Lightning Frame': 'ring-[3px] ring-yellow-300/80 shadow-[0_0_28px_8px_rgba(253,224,71,0.4)] animate-[lightning-flash_2s_ease-in-out_infinite]',
  'Obsidian Frame': 'ring-[3px] ring-gray-800/90 shadow-[0_0_20px_4px_rgba(0,0,0,0.5),0_0_40px_8px_rgba(88,28,135,0.2)]',
  'Holographic Frame': 'ring-[3px] ring-pink-400/60 shadow-[0_0_24px_6px_rgba(236,72,153,0.3)] animate-[holographic-shift_3s_linear_infinite]',
};

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { profile: currentProfile } = useAuth();
  const { data: profile, isLoading } = useProfileByUsername(username!);
  const { data: posts } = usePosts(undefined, profile?.id);
  const { data: savedPosts } = useSavedPosts();
  const follow = useFollow();
  const updateAvatar = useUpdateAvatar();
  const createConversation = useCreateConversation();
  const markConversationReadByUser = useMarkConversationReadByUser();
  const [activeTab, setActiveTab] = useState('posts');
  const { data: profileRole } = useUserRoleById(profile?.id);
  const isModOrAdmin = useIsModOrAdmin();
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  
  const liveFollowerCount = useLiveFollowerCount(profile?.id);
  const { data: userBadges } = useUserBadges(profile?.id);
  const { data: primaryBadge } = useUserPrimaryBadge(profile?.id);
  const { data: lockerData } = useLockerItems(profile?.id);

  const isOwnProfile = !!currentProfile && !!profile && currentProfile.id === profile.id;

  const badgeSettings = (profile as any)?.badge_settings || {};
  const showOwnerBadge = badgeSettings.show_owner_badge !== false;
  const showOwnerWifeBadge = badgeSettings.show_owner_wife_badge !== false;
  const showModBadge = badgeSettings.show_mod_badge !== false;
  
  const displayBadges = userBadges?.slice(0, 5).map(ub => ({
    id: ub.badge.id,
    icon: ub.badge.icon,
    name: ub.badge.name,
    description: ub.badge.description,
    gradient_from: ub.badge.gradient_from,
    gradient_to: ub.badge.gradient_to,
    effect: ub.badge.effect,
    is_animated: ub.badge.is_animated,
  })) || [];

  useEffect(() => {
    if (profile?.id && currentProfile?.id && profile.id !== currentProfile.id) {
      markConversationReadByUser.mutate(profile.id);
    }
  }, [profile?.id, currentProfile?.id]);

  // Compute name color
  const nameColor = lockerData?.equippedNameColor ? NAME_COLOR_MAP[lockerData.equippedNameColor] : undefined;
  
  // Compute effect class
  const effectClass = lockerData?.equippedEffect ? EFFECT_CLASS_MAP[lockerData.equippedEffect] : undefined;
  
  // Compute frame class
  const frameClass = lockerData?.equippedFrame ? FRAME_CLASS_MAP[lockerData.equippedFrame] : undefined;
  
  // Compute profile theme gradient
  const themeGradient = lockerData?.equippedProfileTheme ? THEME_GRADIENTS[lockerData.equippedProfileTheme] : undefined;

  const handleFollow = async () => {
    if (!profile) return;
    try {
      await follow.mutateAsync({
        targetId: profile.id,
        isFollowing: profile.is_following,
      });
      toast.success(profile.is_following ? 'Unfollowed' : 'Following!');
    } catch (error) {
      toast.error('Something went wrong');
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await updateAvatar.mutateAsync(file);
      toast.success('Avatar updated!');
    } catch (error) {
      toast.error('Failed to update avatar');
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const conversation = await createConversation.mutateAsync({
        memberIds: [profile.id],
      });
      navigate(`/messages/${conversation.id}`);
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  const gridPosts = posts?.filter((p) => p.type === 'post' || p.type === 'video') || [];
  const shortPosts = posts?.filter((p) => p.type === 'short') || [];

  const clipsForGrid = shortPosts.map(post => ({
    id: post.id,
    media_url: post.media_url,
    caption: post.caption || '',
    tags: post.tags || [],
    author: post.author,
    like_count: post.like_count,
    comment_count: post.comment_count,
    is_liked: post.is_liked,
    is_bookmarked: post.is_bookmarked,
    view_count: post.view_count || 0,
  }));

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="space-y-4 flex-1">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="flex gap-8">
                <Skeleton className="h-12 w-16" />
                <Skeleton className="h-12 w-16" />
                <Skeleton className="h-12 w-16" />
              </div>
            </div>
          </div>
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
            <Button variant="outline" onClick={() => navigate(-1)}>
              Go Back
            </Button>
            <Button onClick={() => navigate('/home')}>
              Go Home
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Profile Theme Overlay */}
        {themeGradient && (
          <div
            className="absolute inset-x-0 top-0 h-48 -z-10 opacity-40 pointer-events-none"
            style={{ background: themeGradient }}
          />
        )}

        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-center gap-8 mb-8"
        >
          {/* Avatar */}
          <div className="relative group">
            <div className={cn(
              "p-1 rounded-full transition-all duration-500",
              frameClass || "story-ring",
            )}>
              <Avatar className="h-32 w-32 border-4 border-background">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-4xl bg-secondary">
                  {profile.username[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            {isOwnProfile && (
              <label className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40">
                <Camera className="h-8 w-8 text-white/80" strokeWidth={1.5} />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-4">
              <div className="flex flex-col">
                {/* Display Name */}
                {profile.display_name && (
                  <h1 className={cn(
                    "text-2xl font-bold flex items-center gap-2",
                    effectClass,
                  )}>
                    <span style={nameColor ? { color: nameColor } : undefined}>
                      <StyledUsername
                        userId={profile.id}
                        username={profile.username}
                        displayName={profile.display_name}
                        preferDisplayName={true}
                        className="text-2xl font-bold"
                      />
                    </span>
                    {showOwnerBadge && isOwner(profile.username) && <OwnerBadge />}
                    {showOwnerWifeBadge && isOwnerWife(profile.id) && <OwnerWifeRingBadge />}
                    {showModBadge && profileRole && <ModBadge role={profileRole} />}
                  </h1>
                )}
                {/* Username */}
                <p 
                  className={cn(
                    profile.display_name ? 'text-sm font-medium drop-shadow-sm' : 'text-2xl font-bold',
                    'flex items-center gap-2',
                    !profile.display_name && effectClass,
                  )}
                  style={{ color: !profile.display_name && nameColor ? nameColor : 'hsl(var(--foreground))', opacity: 1 }}
                >
                  {!profile.display_name ? (
                    <StyledUsername
                      userId={profile.id}
                      username={profile.username}
                      showAtSymbol={true}
                      preferDisplayName={false}
                      className="text-2xl font-bold"
                    />
                  ) : (
                    `@${profile.username}`
                  )}
                  {!profile.display_name && showOwnerBadge && isOwner(profile.username) && <OwnerBadge />}
                  {!profile.display_name && showOwnerWifeBadge && isOwnerWife(profile.id) && <OwnerWifeRingBadge />}
                  {!profile.display_name && showModBadge && profileRole && <ModBadge role={profileRole} />}
                </p>
                
                {/* Badge Row */}
                {displayBadges.length > 0 && (
                  <div className="mt-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                    <BadgeRow badges={displayBadges} maxVisible={5} size="sm" />
                  </div>
                )}
                 
                {/* Equipped Title */}
                {lockerData?.equippedTitle && (
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-primary/20 to-accent/20 border border-primary/30 text-primary">
                      {lockerData.equippedTitle}
                    </span>
                  </div>
                )}
              </div>
              {isOwnProfile ? (
                <Link to="/settings">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button variant="secondary" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  </motion.div>
                </Link>
              ) : (
                <div className="flex gap-2">
                  <FriendButton userId={profile.id} size="sm" />
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant={profile.is_following ? 'secondary' : 'gradient'}
                      size="sm"
                      onClick={handleFollow}
                      disabled={follow.isPending}
                    >
                      {profile.is_following ? 'Following' : 'Follow'}
                    </Button>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleMessage}
                      disabled={createConversation.isPending}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </motion.div>
                  
                  {isModOrAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
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
                          onWarnClick={() => setWarnDialogOpen(true)}
                          onBanClick={() => setBanDialogOpen(true)}
                          onMemeBanClick={() => setMemeBanDialogOpen(true)}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex justify-center md:justify-start gap-8 mb-4">
              <div className="text-center">
                <p className="font-bold text-xl drop-shadow-md" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>{profile.post_count}</p>
                <p className="text-sm font-medium drop-shadow-sm" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>posts</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-xl drop-shadow-md" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>
                  {liveFollowerCount}
                </p>
                <p className="text-sm font-medium drop-shadow-sm" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>followers</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-xl drop-shadow-md" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>{profile.following_count}</p>
                <p className="text-sm font-medium drop-shadow-sm" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>following</p>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="max-w-md drop-shadow-sm" style={{ color: 'hsl(var(--foreground))', opacity: 1 }}>{profile.bio}</p>
            )}
            
            {!isOwnProfile && (
              <div className="mt-4">
                <MutualFriendsDisplay targetUserId={profile.id} variant="compact" />
              </div>
            )}
          </div>
        </motion.div>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full mb-6 bg-card/80 border border-border">
            <TabsTrigger value="posts" className="flex-1 gap-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <Grid className="h-4 w-4" />
              <span>Posts</span>
            </TabsTrigger>
            <TabsTrigger value="shorts" className="flex-1 gap-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <Film className="h-4 w-4" />
              <span>Clips</span>
            </TabsTrigger>
            {isOwnProfile && (
              <TabsTrigger value="locker" className="flex-1 gap-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <Package className="h-4 w-4" />
                <span>Locker</span>
              </TabsTrigger>
            )}
            {isOwnProfile && (
              <TabsTrigger value="saved" className="flex-1 gap-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                <Bookmark className="h-4 w-4" />
                <span>Saved</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="posts">
            {gridPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-1">
                {gridPosts.map((post) => (
                  <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="aspect-square overflow-hidden bg-muted rounded-sm"
                    >
                      {post.type === 'video' ? (
                        <>
                          <video src={post.media_url} className="w-full h-full object-cover" muted />
                          <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
                            <Play className="h-3 w-3 text-white" fill="white" />
                          </div>
                        </>
                      ) : (
                        <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                      )}
                    </motion.div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-sm">
                      <span className="font-semibold text-white">❤️ {post.like_count}</span>
                      <span className="font-semibold text-white">💬 {post.comment_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-4xl mb-4">📷</p>
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="shorts">
            <ClipsGrid clips={clipsForGrid} />
          </TabsContent>

          {isOwnProfile && (
            <TabsContent value="locker">
              <ProfileLocker />
            </TabsContent>
          )}

          {isOwnProfile && (
            <TabsContent value="saved">
              {savedPosts && savedPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {savedPosts.map((post) => (
                    <Link key={post.id} to={`/p/${post.id}`} className="relative group">
                      <motion.div 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="aspect-square overflow-hidden bg-muted rounded-sm"
                      >
                        {post.type === 'video' || post.type === 'short' ? (
                          <>
                            <video src={post.media_url} className="w-full h-full object-cover" muted />
                            <div className="absolute top-2 left-2 p-1.5 rounded-full bg-black/50">
                              <Play className="h-3 w-3 text-white" fill="white" />
                            </div>
                          </>
                        ) : (
                          <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                        )}
                      </motion.div>
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-sm">
                        <span className="font-semibold text-white">❤️ {post.like_count}</span>
                        <span className="font-semibold text-white">💬 {post.comment_count}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-4xl mb-4">🔖</p>
                  <p className="text-muted-foreground">No saved posts yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Posts you save will appear here</p>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
        
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
      </div>
    </AppLayout>
  );
}
