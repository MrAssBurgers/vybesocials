import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingSheet } from '@/components/profile/FollowersFollowingSheet';
import { useStories, type StoryGroup } from '@/hooks/useStories';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { toast } from 'sonner';
import { useUnfriend } from '@/hooks/useFriends';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { db } from '@/lib/firebase';
import { blockUserAndNotifyModeration } from '@/lib/blockUserSafety';
import { useProfileViewModel } from '@/features/profile/useProfileViewModel';
import { ProfileCoverHero } from '@/features/profile/components/ProfileCoverHero';
import { ProfilePrimaryActions } from '@/features/profile/components/ProfilePrimaryActions';
import { ProfileLevelScoreRow } from '@/features/profile/components/ProfileLevelScoreRow';
import { ProfileRelationshipCards } from '@/features/profile/components/ProfileRelationshipCards';
import { ProfileStoryHighlights } from '@/features/profile/components/ProfileStoryHighlights';
import { ProfileContentTabs } from '@/features/profile/components/ProfileContentTabs';
import { ProfileBadgesRow } from '@/features/profile/components/ProfileBadgesRow';
import { ProfileAboutSheet } from '@/features/profile/sheets/ProfileAboutSheet';
import { ProfileScoreSheet } from '@/features/profile/sheets/ProfileScoreSheet';
import { ProfileBadgesSheet } from '@/features/profile/sheets/ProfileBadgesSheet';
import { ProfileFriendshipSheet } from '@/features/profile/sheets/ProfileFriendshipSheet';
import { ProfileMoreMenuSheet } from '@/features/profile/sheets/ProfileMoreMenuSheet';
import { FriendsListSheet } from '@/features/profile/sheets/FriendsListSheet';
import { ReportContentDialog } from '@/components/safety/ReportContentDialog';
import { useSafetyReport } from '@/hooks/useSafetyReport';
import { isReportSessionError } from '@/lib/reportModerationService';
import '@/features/profile/profile-chrome.css';

function ProfileSkeleton() {
  return (
    <AppLayout>
      <div className="vybe-profile-shell mx-auto space-y-3 pb-24">
        <Skeleton className="h-36 w-full" />
        <div className="space-y-2 px-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </AppLayout>
  );
}

export default function ProfileViewPage() {
  const submitSafetyReport = useSafetyReport();
  const { username } = useParams<{ username: string }>();
  const vm = useProfileViewModel(username);
  const myProfileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const unfriend = useUnfriend();
  const { isPremium: viewerPremium } = usePremiumStatus();

  const coverQuery = useQuery({
    queryKey: ['profile-cover-bg', vm.profile?.id],
    queryFn: async () => {
      if (!vm.profile?.id) return null;
      const { data } = await db
        .from('user_backgrounds')
        .select('image_url')
        .eq('user_id', vm.profile.id)
        .eq('is_active', true)
        .maybeSingle();
      return (data as { image_url?: string } | null)?.image_url ?? null;
    },
    enabled: !!vm.profile?.id,
    staleTime: 60_000,
  });

  const onlineIds = vm.permissions.online && vm.profile?.id ? [vm.profile.id] : [];
  const { data: onlineMap } = useUsersOnlineStatus(onlineIds);
  const { data: storyGroups } = useStories(vm.profile?.id);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [friendshipOpen, setFriendshipOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [followSheet, setFollowSheet] = useState<'followers' | 'following' | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [storyViewer, setStoryViewer] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const myStoryGroup = useMemo(() => {
    if (!vm.profile || !storyGroups?.length) return null;
    return (
      storyGroups.find(
        (g) => g.user.id === vm.profile!.id || g.user.username === vm.profile!.username,
      ) ?? null
    );
  }, [storyGroups, vm.profile]);

  const viewerGroups: StoryGroup[] = useMemo(
    () => (myStoryGroup ? [myStoryGroup] : []),
    [myStoryGroup],
  );

  if (!username || (vm.isPending && !vm.profile)) {
    return <ProfileSkeleton />;
  }

  if (vm.isError || !vm.profile) {
    return (
      <AppLayout>
        <div className="vybe-profile-shell mx-auto p-6">
          <EmptyState
            title="Profile not found"
            description="This user may not exist or their profile is unavailable."
          />
        </div>
      </AppLayout>
    );
  }

  if (vm.mode === 'blocked') {
    return (
      <AppLayout>
        <div className="vybe-profile-shell mx-auto p-6">
          <EmptyState
            icon={<ShieldOff className="h-8 w-8" />}
            title="Unavailable"
            description="You can't view this profile."
          />
        </div>
      </AppLayout>
    );
  }

  const profile = vm.profile;
  const isOnline = !!(vm.permissions.online && onlineMap?.[profile.id]);
  const showPremium = vm.mode === 'self' ? viewerPremium : false;
  const showFriendsStat =
    vm.mode === 'self' || vm.permissions.friends_list || vm.mode === 'friend';

  const handleBlock = async () => {
    if (!myProfileId) return;
    try {
      const blockResult = await blockUserAndNotifyModeration({
        blockerId: myProfileId,
        blockedId: profile.id,
        context: 'profile view',
      });
      queryClient.setQueryData<string[]>(['blocked-user-ids', myProfileId], (prev) => {
        const next = new Set(prev || []);
        next.add(profile.id);
        return Array.from(next);
      });
      await queryClient.invalidateQueries({ queryKey: ['blocked-user-ids', myProfileId] });
      blockResult.guard();
      if (blockResult.reportSubmitted) toast.success('User blocked');
      else toast.error('User blocked, but the report was not confirmed. Please also submit a report.');
      vm.refetch();
    } catch (err) {
      if (isReportSessionError(err)) return;
      toast.error(err instanceof Error ? err.message : 'Could not block user');
    }
  };

  const handleReport = async (reason: string) => {
    await submitSafetyReport({ targetType: 'profile', targetId: profile.id, reason });
    toast.success('Report submitted.');
  };

  return (
    <AppLayout>
      <main className="vybe-profile-page vybe-profile-chrome vybe-profile-shell min-h-screen pb-24">
        <ProfileCoverHero
          profile={profile}
          coverThemeId={vm.coverThemeId}
          coverImageUrl={coverQuery.data}
          counts={vm.counts}
          showBio={vm.permissions.bio}
          showLocation={vm.permissions.location}
          showBirthday={vm.permissions.birthday}
          showPronouns={vm.permissions.pronouns}
          showFriendsStat={showFriendsStat}
          hasStory={vm.storyState.hasStory && vm.permissions.stories}
          hasUnviewedStory={vm.storyState.hasUnviewed}
          isOnline={isOnline}
          isVerified={!!profile.is_verified}
          isPremium={showPremium}
          onBioMore={() => setAboutOpen(true)}
          onMore={() => setMoreOpen(true)}
          onStoryClick={() => setStoryViewer(true)}
          onStatClick={(stat) => {
            if (stat === 'followers') setFollowSheet('followers');
            else if (stat === 'following') setFollowSheet('following');
            else if (stat === 'friends') {
              if (vm.mode === 'self' || vm.permissions.friends_list || vm.mode === 'friend') {
                setFriendsOpen(true);
              }
            }
          }}
        />

        <div className="vybe-profile-body space-y-3 pt-3">
          <ProfilePrimaryActions
            profile={profile}
            mode={vm.mode}
            primaryAction={vm.primaryAction}
            secondaryActions={vm.secondaryActions}
            onMore={() => setMoreOpen(true)}
          />

          <ProfileLevelScoreRow
            level={vm.level}
            score={vm.score}
            onOpenScore={() => {
              if (vm.score.visible) setScoreOpen(true);
            }}
          />

          <ProfileStoryHighlights
            profileId={profile.id}
            username={profile.username}
            avatarUrl={profile.avatar_url}
            isOwnProfile={vm.mode === 'self'}
            canViewStories={vm.permissions.stories}
          />

          {vm.mode === 'friend' && (
            <ProfileRelationshipCards
              otherProfileId={profile.id}
              summary={vm.relationshipSummary}
              onOpenFriendship={() => setFriendshipOpen(true)}
            />
          )}

          <ProfileBadgesRow
            displayName={profile.display_name || profile.username}
            badges={vm.featuredBadges}
            onSeeAll={() => setBadgesOpen(true)}
          />

          <ProfileContentTabs
            profileId={profile.id}
            canViewPosts={vm.permissions.posts}
            canViewClips={vm.permissions.clips}
          />
        </div>
      </main>

      <ProfileAboutSheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        profile={profile}
        showLocation={vm.permissions.location}
        showBirthday={vm.permissions.birthday}
        showPronouns={vm.permissions.pronouns}
      />

      {vm.score.visible && (
        <ProfileScoreSheet
          open={scoreOpen}
          onOpenChange={setScoreOpen}
          profileId={profile.id}
          score={vm.score.score}
          level={vm.level.level}
          xpToNext={vm.level.xpToNext}
        />
      )}

      <ProfileBadgesSheet
        open={badgesOpen}
        onOpenChange={setBadgesOpen}
        profileId={profile.id}
      />

      {vm.mode === 'friend' && (
        <ProfileFriendshipSheet
          open={friendshipOpen}
          onOpenChange={setFriendshipOpen}
          otherProfileId={profile.id}
          summary={vm.relationshipSummary}
        />
      )}

      <ProfileMoreMenuSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        profile={profile}
        mode={vm.mode}
        menuActions={vm.menuActions}
        onViewFriendship={() => setFriendshipOpen(true)}
        onBlock={() => void handleBlock()}
        onRemoveFriend={() => {
          unfriend.mutate(profile.id, {
            onSuccess: () => toast.success('Friend removed'),
          });
        }}
        onReport={() => setReportOpen(true)}
      />

      <ReportContentDialog
        key={submitSafetyReport.sessionKey + ':' + profile.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
        title={`Report @${profile.username}`}
        description="Why are you reporting this account?"
        onSubmit={handleReport}
      />

      <FollowersFollowingSheet
        open={followSheet !== null}
        onOpenChange={(o) => !o && setFollowSheet(null)}
        profileId={profile.id}
        mode={followSheet || 'followers'}
        username={profile.username}
      />

      <FriendsListSheet
        open={friendsOpen}
        onOpenChange={setFriendsOpen}
        profileId={profile.id}
        username={profile.username}
      />

      {storyViewer && viewerGroups.length > 0 && (
        <StoryViewer
          groups={viewerGroups}
          initialGroupIndex={0}
          onClose={() => setStoryViewer(false)}
        />
      )}
    </AppLayout>
  );
}
