import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { FollowButton } from '@/components/profile/FollowButton';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MessageCircle, BadgeCheck } from 'lucide-react';
import { useMutualFriendsWithUser } from '@/components/profile/MutualFriendsDisplay';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useDisplayStyle } from '@/hooks/useDisplayStyle';

interface UserProfileHoverCardProps {
  username: string;
  children: ReactNode;
  userId?: string;
  avatarUrl?: string | null;
}

interface ProfileData {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_verified: boolean | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
}

function useHoverProfile(username: string, enabled: boolean) {
  const { profile: currentUser } = useAuth();

  return useQuery({
    queryKey: ['hover-profile', username],
    queryFn: async (): Promise<ProfileData | null> => {
      // Use case-insensitive lookup with ilike
      const { data: profiles, error } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, is_verified')
        .ilike('username', username)
        .limit(1);

      const profileData = profiles?.[0];
      if (error || !profileData) {
        console.warn('[HoverCard] Profile not found:', username, error?.message);
        return null;
      }

      // Get counts in parallel
      const [followerRes, followingRes, postRes, isFollowingRes] = await Promise.all([
        db
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('following_id', profileData.id),
        db
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', profileData.id),
        db
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', profileData.id),
        currentUser?.id
          ? db
              .from('follows')
              .select('id')
              .eq('follower_id', currentUser.id)
              .eq('following_id', profileData.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...profileData,
        follower_count: followerRes.count || 0,
        following_count: followingRes.count || 0,
        post_count: postRes.count || 0,
        is_following: !!isFollowingRes.data,
      };
    },
    enabled,
    staleTime: 30000, // Cache for 30 seconds
    retry: 1,
  });
}

// Mini mutual friends row component for hover card
import { forwardRef as _forwardRef } from 'react';
const MutualFriendsRow = _forwardRef<HTMLDivElement, { targetUserId: string }>(function MutualFriendsRow({ targetUserId, ...props }, ref) {
  const navigate = useNavigate();
  const { data: mutualFriends, isLoading } = useMutualFriendsWithUser(targetUserId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  const count = mutualFriends?.length || 0;
  if (count === 0) return null;

  const displayFriends = mutualFriends?.slice(0, 3) || [];

  return (
    <div ref={ref} className="flex items-center gap-2" {...props}>
      <div className="flex -space-x-1.5">
        {displayFriends.map((friend) => (
          <button
            key={friend.id}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/u/${friend.username}`);
            }}
            className="relative hover:z-10 transition-transform hover:scale-110 focus:outline-none rounded-full"
            title={friend.display_name || friend.username}
          >
            <Avatar className="h-5 w-5 border border-background cursor-pointer">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-[8px] bg-primary/20">
                {friend.username?.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {count} mutual friend{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
});

export function UserProfileHoverCard({ 
  username, 
  children,
  userId,
  avatarUrl,
}: UserProfileHoverCardProps) {
  const navigate = useNavigate();
  const { profile: currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: profileData, isLoading } = useHoverProfile(username, isOpen);
  
  // Fetch display style for badge-based name coloring
  const { data: displayStyle } = useDisplayStyle(profileData?.id);
  
  const signedAvatarUrl = useSignedUrl(profileData?.avatar_url || avatarUrl);
  
  const isOwnProfile = currentUser?.username === username;

  const handleMessage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!profileData) return;
    
    // Navigate to messages and create/open DM
    navigate(`/messages/new?user=${profileData.id}`);
  };

  return (
    <HoverCard openDelay={300} closeDelay={100} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent 
        className="w-auto min-w-64 max-w-80 p-4" 
        side="top" 
        align="start"
        sideOffset={8}
      >
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-14 w-14 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <Skeleton className="h-10 w-full" />
          </div>
        ) : profileData ? (
          <div className="space-y-3">
            {/* Header - vertical layout to prevent name cutoff */}
            <div className="flex items-center gap-3">
              <Link to={`/u/${username}`} onClick={(e) => e.stopPropagation()}>
                <Avatar className="h-14 w-14 ring-2 ring-primary/20 flex-shrink-0">
                  <AvatarImage src={signedAvatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {username[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <Link 
                to={`/u/${username}`} 
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1.5">
                  <StyledUsername
                    userId={profileData.id}
                    username={username}
                    displayName={profileData.display_name}
                    badgeStyle={displayStyle}
                    className="font-semibold text-base"
                  />
                  {profileData.is_verified && (
                    <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" />
                  )}
                  {isOwner(username) && <OwnerBadge className="flex-shrink-0" />}
                </div>
                <p className="text-sm text-muted-foreground">@{username}</p>
              </Link>
            </div>

            {/* Bio */}
            {profileData.bio && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {profileData.bio}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="font-semibold">{profileData.post_count}</span>
                <span className="text-muted-foreground ml-1">posts</span>
              </div>
              <div>
                <span className="font-semibold">{profileData.follower_count}</span>
                <span className="text-muted-foreground ml-1">followers</span>
              </div>
              <div>
                <span className="font-semibold">{profileData.following_count}</span>
                <span className="text-muted-foreground ml-1">following</span>
              </div>
            </div>

            {/* Mutual Friends */}
            {!isOwnProfile && currentUser && (
              <MutualFriendsRow targetUserId={profileData.id} />
            )}

            {/* Actions */}
            {!isOwnProfile && currentUser && (
              <div className="flex items-center gap-2 pt-1">
                <FollowButton targetId={profileData.id} className="flex-1" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMessage}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">User not found</p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
