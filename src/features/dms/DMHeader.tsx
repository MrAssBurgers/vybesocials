import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { TrashBin } from '@/components/chat/TrashBin';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

interface DMHeaderProps {
  totalUnreadCount: number;
  onSearch: () => void;
}

export function DMHeader({ totalUnreadCount, onSearch }: DMHeaderProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [trashOpen, setTrashOpen] = useState(false);

  return (
    <header className="dm-inbox-hero">
      <div className="dm-inbox-header-bar">
        <div className="dm-inbox-header-side">
          <button
            type="button"
            className="dm-inbox-profile-button"
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
          <button
            type="button"
            className="dm-inbox-header-action"
            onClick={onSearch}
            aria-label="Search chats"
          >
            <Search />
          </button>
        </div>

        <div className="dm-inbox-header-title-wrap">
          <h1 className="dm-inbox-title">Chat</h1>
          {totalUnreadCount > 0 && (
            <span className="dm-inbox-title-badge">
              {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
            </span>
          )}
        </div>

        <div className="dm-inbox-header-side dm-inbox-header-side--right">
          <button
            type="button"
            className="dm-inbox-header-action"
            onClick={() => navigate('/notifications')}
            aria-label="Notifications"
          >
            <Bell />
          </button>
          <button
            type="button"
            className="dm-inbox-header-action"
            onClick={() => navigate('/messages/new')}
            aria-label="Add friend"
          >
            <UserPlus />
          </button>
          <TrashBin
            open={trashOpen}
            onOpenChange={setTrashOpen}
            trigger={
              <button
                type="button"
                className="dm-inbox-header-action"
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
