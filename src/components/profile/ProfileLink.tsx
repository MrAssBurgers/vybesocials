import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { publicProfilePath } from '@/lib/friendProfileRoutes';

interface ProfileLinkProps extends Omit<LinkProps, 'to'> {
  username: string;
  userId?: string;
  /** Retained for call-site compatibility; /u/ is always canonical. */
  forcePublic?: boolean;
}

/** Canonical profile link for every relationship state. */
export const ProfileLink = forwardRef<HTMLAnchorElement, ProfileLinkProps>(function ProfileLink(
  {
    username,
    userId: _userId,
    forcePublic: _forcePublic,
    children,
    ...rest
  },
  ref,
) {
  return (
    <Link ref={ref} to={publicProfilePath(username)} {...rest}>
      {children}
    </Link>
  );
});
