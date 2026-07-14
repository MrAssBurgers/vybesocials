import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { TrashBin } from '@/components/chat/TrashBin';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

interface DMHeaderProps {
  totalUnreadCount: number;
  pendingRequestCount?: number;
  activityLine?: string;
  onSearch: () => void;
}

export function DMHeader({
  pendingRequestCount = 0,
  onSearch,
}: DMHeaderProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [trashOpen, setTrashOpen] = useState(false);

  return (
    <header className="dm-inbox-hero dm-inbox-hero--sticky">
      <div className="dm-inbox-header-bar dm-inbox-header-bar--snap">
        <div className="dm-inbox-header-side dm-inbox-header-side--start">
          <button
            type="button"
            className="dm-inbox-profile-button dm-vfx-press"
            aria-label="Open your profile"
            onClick={() => {
              navigate('/profile');
            }}
          >
            <Avatar className="dm-inbox-header-avatar">
              <ProfileAvatarImage
                profileId={profile?.id}
                src={profile?.avatar_url || undefined}
                priority
              />
              <AvatarFallback className="bg-muted text-sm font-semibold">
                {profile?.username?.[0]?.toUpperCase() || 'V'}
              </AvatarFallback>
            </Avatar>
            <span className="dm-inbox-presence-dot" aria-hidden />
          </button>
          <button
            type="button"
            className="dm-inbox-header-action dm-vfx-press"
            onClick={onSearch}
            aria-label="Search messages"
          >
            <Search />
          </button>
        </div>

        <h1 className="dm-inbox-title dm-inbox-title--centered">Chat</h1>

        <div className="dm-inbox-header-side dm-inbox-header-side--right">
          <button
            type="button"
            className="dm-inbox-header-action dm-vfx-press"
            onClick={() => navigate('/notifications')}
            aria-label="Notifications"
          >
            <Bell />
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
