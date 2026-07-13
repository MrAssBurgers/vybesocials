import { memo } from 'react';
import { Camera, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FriendButton } from '@/components/friends/FriendButton';
import { FriendProfileActions } from '@/components/friend-profile/FriendProfileActions';
import type { SocialProfileMode } from './SocialProfileHero';
import { useAuth } from '@/lib/auth';
import {
  openSnapCamera,
  useCameraOverlayOptional,
} from '@/contexts/CameraOverlayContext';

interface RelationshipProfileActionsProps {
  profile: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
  };
  mode: SocialProfileMode;
}

async function shareProfile(profile: RelationshipProfileActionsProps['profile']) {
  const { buildProfileShareUrl } = await import('@/lib/shareLinks');
  const url = buildProfileShareUrl(profile.username);
  if (navigator.share) {
    await navigator.share({
      title: `${profile.display_name || profile.username} on VYBE`,
      url,
    });
    return;
  }
  await navigator.clipboard.writeText(url);
  toast.success('Profile link copied');
}

export const RelationshipProfileActions = memo(function RelationshipProfileActions({
  profile,
  mode,
}: RelationshipProfileActionsProps) {
  const camera = useCameraOverlayOptional();
  const { profile: viewer } = useAuth();

  const sendSnap = () => {
    if (!camera || !viewer?.id) {
      toast.error('Camera is unavailable');
      return;
    }
    openSnapCamera(camera.openCamera, {
      source: 'profile',
      profileId: profile.id,
      recipientIds: [profile.id],
      returnRoute: `/u/${encodeURIComponent(profile.username)}`,
    });
  };

  if (mode === 'friend') {
    return (
      <div className="space-y-2">
        <FriendProfileActions profile={profile} friendshipStatus="friends" />
        <Button variant="secondary" className="w-full" onClick={sendSnap}>
          <Camera className="mr-2 h-4 w-4" />
          Send VYBE Snap
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <FriendButton userId={profile.id} className="min-w-0 flex-1" />
      <Button
        variant="secondary"
        size="icon"
        onClick={() => void shareProfile(profile)}
        aria-label="Share profile"
      >
        <Share2 className="h-4 w-4" />
      </Button>
    </div>
  );
});
