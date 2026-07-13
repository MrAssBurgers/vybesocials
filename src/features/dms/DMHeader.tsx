import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { TrashBin } from '@/components/chat/TrashBin';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

interface DMHeaderProps {
  totalUnreadCount: number;
  pendingRequestCount?: number;
  activityLine?: string;
  onSearch: () => void;
}

export function DMHeader({
  totalUnreadCount,
  pendingRequestCount = 0,
  activityLine,
  onSearch,
}: DMHeaderProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [trashOpen, setTrashOpen] = useState(false);

  const computedActivity = useMemo(() => {
    if (activityLine) return activityLine;
    if (totalUnreadCount > 0) {
      return totalUnreadCount === 1
        ? '1 unread message'
        : `${totalUnreadCount > 99 ? '99+' : totalUnreadCount} unread messages`;
    }
    return 'All caught up';
  }, [activityLine, totalUnreadCount]);

  return (
    <header className="dm-inbox-hero dm-inbox-hero--sticky">
      <div className="dm-inbox-header-bar">
        <div className="dm-inbox-header-side dm-inbox-header-side--start">
          <button
            type="button"
            className="dm-inbox-profile-button dm-vfx-press"
            aria-label="Open your profile"
            onClick={() => {
              if (profile?.username) {
                openFriendProfile(navigate, {
                  username: profile.username,
                  friendshipStatus: 'friends',
                });
              }
            }}
          >
            <Avatar className="h-11 w-11">
              <ProfileAvatarImage
                profileId={profile?.id}
                src={profile?.avatar_url || undefined}
                priority
              />
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {profile?.username?.[0]?.toUpperCase() || 'V'}
              </AvatarFallback>
            </Avatar>
            <span className="dm-inbox-online-dot" aria-hidden />
          </button>
          <div className="dm-inbox-header-title-wrap dm-inbox-header-title-wrap--left">
            <h1 className="dm-inbox-title">Messages</h1>
            <p className="dm-inbox-activity-line">{computedActivity}</p>
          </div>
        </div>

        <div className="dm-inbox-header-side dm-inbox-header-side--right">
          <button
            type="button"
            className="dm-inbox-header-action dm-vfx-press"
            onClick={onSearch}
            aria-label="Search messages"
          >
            <Search />
          </button>
          <button
            type="button"
            className="dm-inbox-header-action dm-inbox-header-action--badge dm-vfx-press"
            onClick={() => navigate('/friends/add')}
            aria-label={
              pendingRequestCount > 0
                ? `Add friends, ${pendingRequestCount} requests`
                : 'Add friends'
            }
          >
            <UserPlus />
            {pendingRequestCount > 0 && (
              <span className="dm-inbox-header-badge">
                {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
              </span>
            )}
          </button>
          <TrashBin
            open={trashOpen}
            onOpenChange={setTrashOpen}
            trigger={
              <button
                type="button"
                className="dm-inbox-header-action dm-vfx-press"
                aria-label="More chat options"
              >
                <MoreHorizontal />
              </button>
            }
          />
        </div>
      </div>
    </header>
  );
}
