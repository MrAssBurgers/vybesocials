import { useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useFriendProfile } from '@/hooks/useFriendProfile';
import { useLockerItems } from '@/hooks/useLockerItems';
import { THEME_GRADIENTS } from '@/lib/cosmeticConstants';
import { SocialProfileHero, type SocialProfileMode } from '@/components/social-profile/SocialProfileHero';
import { RelationshipProfileActions } from '@/components/social-profile/RelationshipProfileActions';
import { SocialProfileContent } from '@/components/social-profile/SocialProfileContent';
import { SocialProfileMoreMenu } from '@/components/social-profile/SocialProfileMoreMenu';
import { CompactProfileSuggestions } from '@/components/social-profile/CompactProfileSuggestions';
import { RelationshipProfileSection } from '@/components/social-profile/RelationshipProfileSection';
import { FriendshipCard } from '@/components/friend-profile/FriendshipCard';
import { FriendMapSection } from '@/components/friend-profile/FriendMapSection';
import { LocationRequestSheet } from '@/components/friend-profile/LocationRequestSheet';
import ProfilePage from '@/pages/Profile';

function relationshipMode(status: string): SocialProfileMode {
  if (status === 'friends') return 'friend';
  if (status === 'pending_sent') return 'pending-sent';
  if (status === 'pending_received') return 'pending-received';
  return 'public';
}

function ProfileSkeleton() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <Skeleton className="h-44 w-full rounded-3xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </AppLayout>
  );
}

export default function RelationshipProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const relationship = useFriendProfile(username);
  const { data: lockerData } = useLockerItems(relationship.profile?.id);

  if (
    !username ||
    relationship.profilePending ||
    (relationship.profile &&
      (relationship.relationshipPending || relationship.visibilityPending))
  ) {
    return <ProfileSkeleton />;
  }

  if (relationship.profileError || !relationship.profile) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg p-6">
          <EmptyState
            title="Profile not found"
            description="This user may not exist or their profile is unavailable."
          />
        </div>
      </AppLayout>
    );
  }

  if (relationship.relationshipError || relationship.visibilityError) {
    return (
      <AppLayout>
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3 p-6 pt-24">
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t verify this profile&apos;s privacy settings.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (relationship.isBlocked) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-lg p-6">
          <EmptyState
            icon={<ShieldOff className="h-8 w-8" />}
            title="Unavailable"
            description="You can't view this profile."
          />
        </div>
      </AppLayout>
    );
  }

  // Keep the feature-rich owner surface while /u/:username remains canonical.
  if (relationship.isSelf) return <ProfilePage />;

  const { profile, visibility, friendshipStatus, isFriend, isPendingRequest } = relationship;
  const mode = relationshipMode(friendshipStatus);
  const canView = (field: string) => visibility?.[field] !== false;
  const themeGradient = lockerData?.equippedProfileTheme
    ? THEME_GRADIENTS[lockerData.equippedProfileTheme]
    : undefined;

  return (
    <AppLayout>
      <main className="mx-auto min-h-screen max-w-lg space-y-4 px-3 pb-24 pt-3 sm:px-4">
        <SocialProfileHero
          profile={profile}
          mode={mode}
          showBio={canView('bio')}
          showMutualFriends={canView('mutual_friends')}
          showOnline={canView('activity')}
          themeGradient={themeGradient}
          onMoreMenu={() => setMoreMenuOpen(true)}
        />

        <RelationshipProfileActions profile={profile} mode={mode} />

        {isFriend && (
          <RelationshipProfileSection friendId={profile.id} friendName={profile.display_name || profile.username} />
        )}

        {isFriend && <FriendshipCard otherProfileId={profile.id} />}

        {(isFriend || isPendingRequest) && canView('location') && (
          <FriendMapSection
            otherProfileId={profile.id}
            otherUsername={profile.username}
            canViewLocation
            onRequestLocation={() => setLocationSheetOpen(true)}
          />
        )}

        <SocialProfileContent
          profileId={profile.id}
          isFriend={isFriend}
          visibility={visibility}
        />

        {mode === 'public' && (
          <CompactProfileSuggestions excludeProfileId={profile.id} />
        )}
      </main>

      {(isFriend || isPendingRequest) && (
        <LocationRequestSheet
          open={locationSheetOpen}
          onOpenChange={setLocationSheetOpen}
          otherProfileId={profile.id}
          otherUsername={profile.username}
        />
      )}

      <SocialProfileMoreMenu
        profile={profile}
        open={moreMenuOpen}
        onOpenChange={setMoreMenuOpen}
      />
    </AppLayout>
  );
}
