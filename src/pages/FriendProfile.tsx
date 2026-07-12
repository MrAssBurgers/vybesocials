import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFriendProfile } from '@/hooks/useFriendProfile';
import { FriendProfileHeader } from '@/components/friend-profile/FriendProfileHeader';
import { FriendProfileActions } from '@/components/friend-profile/FriendProfileActions';
import { FriendshipCard } from '@/components/friend-profile/FriendshipCard';
import { FriendMapSection } from '@/components/friend-profile/FriendMapSection';
import { LocationRequestSheet } from '@/components/friend-profile/LocationRequestSheet';
import { FriendProfileTabs } from '@/components/friend-profile/FriendProfileTabs';
import { FriendProfileMoreMenu } from '@/components/friend-profile/FriendProfileMoreMenu';

export default function FriendProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  const {
    profile,
    profilePending,
    profileError,
    friendshipStatus,
    isFriend,
    isPendingRequest,
    isBlocked,
    visibility,
  } = useFriendProfile(username);

  if (profilePending || !username) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto p-4 space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (profileError || !profile) {
    return (
      <AppLayout>
        <EmptyState
          title="Profile not found"
          description="This user may not exist or was removed."
        />
      </AppLayout>
    );
  }

  if (isBlocked) {
    return (
      <AppLayout>
        <div className="max-w-lg mx-auto p-6">
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Unavailable"
          description="You can't view this profile."
        />
        </div>
      </AppLayout>
    );
  }

  const showBio = visibility?.bio !== false;
  const showMutual = visibility?.mutual_friends !== false;
  const showLocation = visibility?.location !== false;
  const showFriendshipCard = isFriend;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 pb-24 pt-2 space-y-4">
        <FriendProfileHeader
          profile={profile}
          showBio={showBio}
          showMutualFriends={showMutual}
          onMoreMenu={() => setSafetyOpen(true)}
        />

        <FriendProfileActions
          profile={profile}
          friendshipStatus={
            friendshipStatus === 'friends'
              ? 'friends'
              : friendshipStatus === 'pending_sent' || friendshipStatus === 'pending_received'
                ? friendshipStatus
                : 'pending_sent'
          }
        />

        {showFriendshipCard && (
          <FriendshipCard otherProfileId={profile.id} />
        )}

        {(isFriend || isPendingRequest) && (
          <FriendMapSection
            otherProfileId={profile.id}
            otherUsername={profile.username}
            canViewLocation={showLocation}
            onRequestLocation={() => setLocationSheetOpen(true)}
          />
        )}

        <FriendProfileTabs
          profileId={profile.id}
          otherProfileId={profile.id}
          visibility={visibility}
        />
      </div>

      <LocationRequestSheet
        open={locationSheetOpen}
        onOpenChange={setLocationSheetOpen}
        otherProfileId={profile.id}
        otherUsername={profile.username}
      />

      <FriendProfileMoreMenu
        profile={profile}
        open={safetyOpen}
        onOpenChange={setSafetyOpen}
      />
    </AppLayout>
  );
}
