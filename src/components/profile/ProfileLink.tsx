import { Link, type LinkProps } from 'react-router-dom';
import { useMemo } from 'react';
import { profilePathForFriendship } from '@/lib/friendProfileRoutes';
import { useFriends } from '@/hooks/useFriends';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

interface ProfileLinkProps extends Omit<LinkProps, 'to'> {
  username: string;
  userId?: string;
  /** When true, always use public /u/ route (e.g. SEO contexts). */
  forcePublic?: boolean;
}

/** Link that routes friends to /friend/ and strangers to /u/. */
export function ProfileLink({
  username,
  userId,
  forcePublic,
  children,
  ...rest
}: ProfileLinkProps) {
  const profileId = useAuthProfileId();
  const { data: friends } = useFriends();

  const to = useMemo(() => {
    if (forcePublic || !profileId) return profilePathForFriendship(username, 'none');
    if (userId && friends?.some((f) => f?.id === userId)) {
      return profilePathForFriendship(username, 'friends');
    }
    return profilePathForFriendship(username, 'none');
  }, [username, userId, forcePublic, profileId, friends]);

  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  );
}
