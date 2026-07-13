import { MapPin } from 'lucide-react';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import type { NearbyFriendPeer } from '@/hooks/useNearbyFriendLink';
import { resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';

export function DMNearbyPeerRow({
  peer,
  onOpen,
}: {
  peer: NearbyFriendPeer;
  onOpen: () => void;
}) {
  const name = peer.displayName || peer.username || 'Nearby';
  const avatarUrl = resolveProfileAvatarUrl(peer.userId, peer.avatarUrl);

  return (
    <button
      type="button"
      className="dm-inbox-row-tap w-full text-left"
      onClick={onOpen}
      aria-label={`Message ${name}`}
    >
      <div className="dm-inbox-card">
        <div className="dm-inbox-avatar-button" aria-hidden>
          <span className="dm-inbox-avatar-ring" />
          <Avatar className="dm-inbox-avatar">
            <ProfileAvatarImage
              profileId={peer.userId}
              src={avatarUrl || undefined}
              transformSize={160}
            />
            <AvatarFallback className="bg-muted text-sm font-semibold">
              {name[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <span className="dm-inbox-presence-dot" />
        </div>
        <div className="dm-inbox-row-copy">
          <p className="dm-inbox-name">{name}</p>
          <p className="dm-inbox-status dm-inbox-preview--live">
            <MapPin className="dm-inbox-status-icon" aria-hidden />
            <span>Nearby right now</span>
          </p>
          <p className="dm-inbox-message-preview">Tap to start a chat</p>
        </div>
      </div>
    </button>
  );
}
