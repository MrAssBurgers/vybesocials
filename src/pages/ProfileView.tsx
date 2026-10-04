import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldOff } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { FollowersFollowingSheet } from '@/components/profile/FollowersFollowingSheet';
import { toast } from 'sonner';
import { useStories } from '@/hooks/useStories';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { profileFriendshipAction } from '@/lib/profileFriendshipAction';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useProfileSectionQuery } from '@/features/profile/hooks/useProfileSectionQuery';
import { Button } from '@/components/ui/button';
import { useUsersOnlineStatus } from '@/hooks/usePresence';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { db } from '@/lib/firebase';
import { blockUserAndNotifyModeration } from '@/lib/blockUserSafety';
import { useProfileViewModel } from '@/features/profile/useProfileViewModel';
import { ProfileCoverHero } from '@/features/profile/components/ProfileCoverHero';
import { ProfilePrimaryActions } from '@/features/profile/components/ProfilePrimaryActions';
import { ProfileLevelScoreRow } from '@/features/profile/components/ProfileLevelScoreRow';
import { ProfileStoryHighlights } from '@/features/profile/components/ProfileStoryHighlights';
import { ProfileContentTabs } from '@/features/profile/components/ProfileContentTabs';
import { ProfileBadgesRow } from '@/features/profile/components/ProfileBadgesRow';
import { ProfileAboutSheet } from '@/features/profile/sheets/ProfileAboutSheet';
import { ProfileScoreSheet } from '@/features/profile/sheets/ProfileScoreSheet';
import { ProfileBadgesSheet } from '@/features/profile/sheets/ProfileBadgesSheet';
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

/** Mounted only while the latest profile decision permits stories. */
function ProfileHeroWithStories(props: ComponentProps<typeof ProfileCoverHero>) {
  const { data } = useStories(props.profile.id);
  const [open, setOpen] = useState(false);
  const group = data?.find(item => item.user.id === props.profile.id);
  return <><ProfileCoverHero {...props} hasStory={!!group?.stories.length} hasUnviewedStory={group?.hasUnviewed}
    onStoryClick={() => setOpen(true)} />
    {open && group && <StoryViewer groups={[group]} initialGroupIndex={0} onClose={() => setOpen(false)} />}</>;
}

export default function ProfileViewPage() {
  const actor = useProfileAccount();
  const { username } = useParams<{ username: string }>();
  return <ProfileViewForSession key={`${actor.session.uid}:${actor.session.epoch}:${username}`} />;
}

function ProfileViewForSession() {
  const submitSafetyReport = useSafetyReport();
  const { username } = useParams<{ username: string }>();
  const vm = useProfileViewModel(username);
  const actor = useProfileAccount();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const guard = () => { actor.guard(); if (!mounted.current) throw Object.assign(new Error('Open the profile again.'), { code: 'account-changed' }); };
  const myProfileId = actor.ready ? actor.profile!.id : undefined;
  const queryClient = useQueryClient();
  const { isPremium: viewerPremium } = usePremiumStatus();

  const coverQuery = useProfileSectionQuery(['cover', vm.profile?.id], !!vm.profile?.id && !vm.isPending && !vm.isError && vm.mode !== 'blocked', async () => {
    const { data, error } = await db.from('user_backgrounds').select('image_url').eq('user_id', vm.profile!.id).eq('is_active', true).maybeSingle();
    if (error) throw error;
    return (data as { image_url?: string } | null)?.image_url ?? null;
  });

  const onlineIds = vm.permissions.online && vm.profile?.id ? [vm.profile.id] : [];
  const { data: onlineMap } = useUsersOnlineStatus(onlineIds);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [followSheet, setFollowSheet] = useState<'followers' | 'following' | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (!username || vm.isPending) {
    return <ProfileSkeleton />;
  }

  if (vm.isError || !vm.profile) {
    return (
      <AppLayout>
        <div className="vybe-profile-shell mx-auto p-6">
          <EmptyState
            title="Profile unavailable"
            description="We could not confirm access to this profile. Sign in and try again."
          />
          <Button onClick={vm.refetch}>Retry profile</Button>
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
  const Hero = vm.permissions.stories ? ProfileHeroWithStories : ProfileCoverHero;
  const isOnline = !!(vm.permissions.online && onlineMap?.[profile.id]);
  const showPremium = vm.mode === 'self' ? viewerPremium : false;
  const showFriendsStat =
    vm.permissions.friends_list;

  const handleBlock = async () => {
    if (!myProfileId) return;
    try {
      guard();
      const blockResult = await blockUserAndNotifyModeration({
        blockerId: myProfileId,
        blockedId: profile.id,
        context: 'profile view',
      });
      guard();
      blockResult.guard();
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
      try { guard(); } catch { return; }
      toast.error(err instanceof Error ? err.message : 'Could not block user');
    }
  };

  const handleReport = async (reason: string) => {
    await submitSafetyReport({ targetType: 'profile', targetId: profile.id, reason });
    guard(); toast.success('Report submitted.');
  };

  return (
    <AppLayout>
      <main className="vybe-profile-page vybe-profile-chrome vybe-profile-shell min-h-screen pb-24">
        <Hero
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
          onStatClick={(stat) => {
            if (stat === 'followers' && vm.permissions.followers) setFollowSheet('followers');
            else if (stat === 'following' && vm.permissions.following) setFollowSheet('following');
            else if (stat === 'friends') {
              if (vm.permissions.friends_list) {
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

          {vm.permissions.stories && <ProfileStoryHighlights
            profileId={profile.id}
            username={profile.username}
            avatarUrl={profile.avatar_url}
            isOwnProfile={vm.mode === 'self'}
            canViewStories
          />}

          {vm.mode === 'self' && <ProfileBadgesRow
            displayName={profile.display_name || profile.username}
            badges={vm.featuredBadges}
            onSeeAll={() => setBadgesOpen(true)}
          />}

          <ProfileContentTabs
            profileId={profile.id}
            canViewPosts={vm.permissions.posts}
            canViewClips={vm.permissions.clips}
            canViewTagged={vm.mode === 'self' && vm.permissions.posts && vm.permissions.clips}
          />
        </div>
      </main>

      {vm.permissions.bio && <ProfileAboutSheet
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        profile={profile}
        showLocation={vm.permissions.location}
        showBirthday={vm.permissions.birthday}
        showPronouns={vm.permissions.pronouns}
        showBio={vm.permissions.bio}
        showOtherDetails={vm.mode === 'self'}
      />}

      {vm.score.visible && scoreOpen && (
        <ProfileScoreSheet
          open={scoreOpen}
          onOpenChange={setScoreOpen}
          profileId={profile.id}
          score={vm.score.score}
          level={vm.level.level}
          xpToNext={vm.level.xpToNext}
        />
      )}

      {vm.mode === 'self' && badgesOpen && <ProfileBadgesSheet
        open={badgesOpen}
        onOpenChange={setBadgesOpen}
        profileId={profile.id}
      />}

      <ProfileMoreMenuSheet
        open={moreOpen}
        onOpenChange={setMoreOpen}
        profile={profile}
        mode={vm.mode}
        menuActions={vm.menuActions}

        onBlock={() => void handleBlock()}
        onRemoveFriend={() => {
          const remove = async () => {
            try { guard(); await profileFriendshipAction({ action: 'unfriend', targetId: profile.id, expectedOwnerUid: actor.user!.id }, guard); guard(); toast.success('Friend removed'); vm.refetch(); }
            catch (error) { if (!isReportSessionError(error)) { try { guard(); toast.error(error instanceof Error ? error.message : 'Friendship could not be updated.'); } catch { /* Old account. */ } } }
          };
          void remove();
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

      {followSheet && vm.permissions[followSheet] && <FollowersFollowingSheet
        open={followSheet !== null}
        onOpenChange={(o) => !o && setFollowSheet(null)}
        profileId={profile.id}
        mode={followSheet || 'followers'}
        username={profile.username}
      />}

      {vm.permissions.friends_list && friendsOpen && <FriendsListSheet
        open={friendsOpen}
        onOpenChange={setFriendsOpen}
        profileId={profile.id}
        username={profile.username}
      />}

    </AppLayout>
  );
}
