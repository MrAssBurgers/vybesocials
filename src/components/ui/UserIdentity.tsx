import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  getCachedProfile, 
  fetchProfileById, 
  getDisplayName, 
  isRawId,
  type CachedProfile 
} from '@/lib/profileCache';

interface UserIdentityProps {
  userId: string;
  username?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  avatarSize?: 'sm' | 'md' | 'lg';
  linkToProfile?: boolean;
  className?: string;
}

/**
 * UserIdentity - ALWAYS displays proper user identity, NEVER raw IDs
 * 
 * Features:
 * - Instant display from cache
 * - Auto-fetches if needed
 * - Shows skeleton during load
 * - Links to profile optionally
 */
export const UserIdentity = memo(function UserIdentity({
  userId,
  username,
  displayName,
  avatarUrl,
  showAvatar = true,
  avatarSize = 'md',
  linkToProfile = true,
  className = '',
}: UserIdentityProps) {
  const [profile, setProfile] = useState<CachedProfile | null>(() => {
    // If we have valid props, use them
    if (username && !isRawId(username)) {
      return { id: userId, username, display_name: displayName || null, avatar_url: avatarUrl || null };
    }
    // Otherwise check cache
    return getCachedProfile(userId);
  });
  const [isLoading, setIsLoading] = useState(!profile);

  useEffect(() => {
    // If we already have a valid profile, skip
    if (profile && !isRawId(profile.username)) return;
    
    // Check if provided props are valid
    if (username && !isRawId(username)) {
      setProfile({ id: userId, username, display_name: displayName || null, avatar_url: avatarUrl || null });
      setIsLoading(false);
      return;
    }
    
    // Fetch from cache or database
    const cached = getCachedProfile(userId);
    if (cached) {
      setProfile(cached);
      setIsLoading(false);
      return;
    }
    
    // Fetch from database
    setIsLoading(true);
    fetchProfileById(userId).then(fetched => {
      if (fetched) {
        setProfile(fetched);
      }
      setIsLoading(false);
    });
  }, [userId, username, displayName, avatarUrl]);

  const avatarSizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
  };

  const name = getDisplayName(profile);
  const resolvedUsername = profile?.username || 'user';
  const initial = name[0]?.toUpperCase() || 'U';

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showAvatar && <Skeleton className={`${avatarSizes[avatarSize]} rounded-full`} />}
        <Skeleton className="h-4 w-20" />
      </div>
    );
  }

  const content = (
    <div className={`flex items-center gap-2 ${className}`}>
      {showAvatar && (
        <Avatar className={avatarSizes[avatarSize]}>
          <AvatarImage src={profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
            {initial}
          </AvatarFallback>
        </Avatar>
      )}
      <span className="font-medium text-sm truncate">
        {profile?.display_name || `@${resolvedUsername}`}
      </span>
    </div>
  );

  if (linkToProfile && resolvedUsername !== 'user') {
    return (
      <Link to={`/u/${resolvedUsername}`} className="hover:underline">
        {content}
      </Link>
    );
  }

  return content;
});

/**
 * UserAvatar - Just the avatar with proper fallback
 */
export const UserAvatar = memo(function UserAvatar({
  userId,
  username,
  avatarUrl,
  size = 'md',
  className = '',
}: {
  userId: string;
  username?: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const [profile, setProfile] = useState<CachedProfile | null>(() => {
    if (username && avatarUrl !== undefined) {
      return { id: userId, username, display_name: null, avatar_url: avatarUrl };
    }
    return getCachedProfile(userId);
  });

  useEffect(() => {
    if (profile) return;
    
    const cached = getCachedProfile(userId);
    if (cached) {
      setProfile(cached);
      return;
    }
    
    fetchProfileById(userId).then(setProfile);
  }, [userId, profile]);

  const sizes = {
    xs: 'h-5 w-5',
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-10 w-10',
    xl: 'h-12 w-12',
  };

  const name = getDisplayName(profile);
  const initial = name[0]?.toUpperCase() || 'U';

  return (
    <Avatar className={`${sizes[size]} ${className}`}>
      <AvatarImage src={profile?.avatar_url || avatarUrl || undefined} />
      <AvatarFallback className="bg-secondary text-secondary-foreground">
        {initial}
      </AvatarFallback>
    </Avatar>
  );
});

/**
 * UserName - Just the display name, never a raw ID
 */
export const UserName = memo(function UserName({
  userId,
  username,
  displayName,
  showAt = false,
  className = '',
}: {
  userId: string;
  username?: string;
  displayName?: string | null;
  showAt?: boolean;
  className?: string;
}) {
  const [profile, setProfile] = useState<CachedProfile | null>(() => {
    if (username && !isRawId(username)) {
      return { id: userId, username, display_name: displayName || null, avatar_url: null };
    }
    return getCachedProfile(userId);
  });

  useEffect(() => {
    if (profile && !isRawId(profile.username)) return;
    
    if (username && !isRawId(username)) {
      setProfile({ id: userId, username, display_name: displayName || null, avatar_url: null });
      return;
    }
    
    const cached = getCachedProfile(userId);
    if (cached) {
      setProfile(cached);
      return;
    }
    
    fetchProfileById(userId).then(setProfile);
  }, [userId, username, displayName]);

  const name = profile?.display_name || (showAt ? `@${profile?.username || 'user'}` : profile?.username || 'User');

  return <span className={className}>{name}</span>;
});
