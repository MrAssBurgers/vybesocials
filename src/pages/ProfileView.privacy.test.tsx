import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERMISSIONS, type ProfileViewModel } from '@/features/profile/types';
const state = vi.hoisted(() => ({ vm: null as unknown, retry: vi.fn(), stories: vi.fn(), section: vi.fn(), block: vi.fn(), error: vi.fn() }));
vi.mock('@/features/profile/useProfileViewModel', () => ({ useProfileViewModel: () => state.vm }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: true, session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'a' }, guard: vi.fn() }) }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ username: 'target' }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/features/profile/hooks/useProfileSectionQuery', () => ({ useProfileSectionQuery: (...args: unknown[]) => { state.section(...args); return {}; } }));
vi.mock('@/hooks/usePresence', () => ({ useUsersOnlineStatus: () => ({}) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({}) }));
vi.mock('@/hooks/useSafetyReport', () => ({ useSafetyReport: () => Object.assign(vi.fn(), { sessionKey: 'alice' }) }));
vi.mock('@/hooks/useStories', () => ({ useStories: (...args: unknown[]) => { state.stories(...args); return { data: [] }; } }));
vi.mock('@/components/stories/StoryViewer', () => ({ StoryViewer: () => null }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/blockUserSafety', () => ({ blockUserAndNotifyModeration: state.block }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: vi.fn() } }));
vi.mock('@/lib/profileFriendshipAction', () => ({ profileFriendshipAction: vi.fn() }));
vi.mock('@/features/profile/components/ProfileCoverHero', () => ({ ProfileCoverHero: ({ profile, showBio, onStatClick }: { profile: { bio: string }; showBio: boolean; onStatClick: (stat: string) => void }) => <div>{showBio && profile.bio}<button onClick={() => onStatClick('followers')}>Open followers</button></div> }));
vi.mock('@/features/profile/components/ProfilePrimaryActions', () => ({ ProfilePrimaryActions: () => null }));
vi.mock('@/features/profile/components/ProfileLevelScoreRow', () => ({ ProfileLevelScoreRow: () => null }));
vi.mock('@/features/profile/components/ProfileStoryHighlights', () => ({ ProfileStoryHighlights: () => <div>Story highlights</div> }));
vi.mock('@/features/profile/components/ProfileContentTabs', () => ({ ProfileContentTabs: () => <div>Profile sections</div> }));
vi.mock('@/features/profile/components/ProfileBadgesRow', () => ({ ProfileBadgesRow: () => null }));
vi.mock('@/features/profile/sheets/ProfileAboutSheet', () => ({ ProfileAboutSheet: () => <div>About sheet</div> }));
vi.mock('@/features/profile/sheets/ProfileScoreSheet', () => ({ ProfileScoreSheet: () => null }));
vi.mock('@/features/profile/sheets/ProfileBadgesSheet', () => ({ ProfileBadgesSheet: () => null }));
vi.mock('@/features/profile/sheets/ProfileMoreMenuSheet', () => ({ ProfileMoreMenuSheet: ({ onBlock }: { onBlock: () => void }) => <button onClick={onBlock}>Block account</button> }));
vi.mock('@/features/profile/sheets/FriendsListSheet', () => ({ FriendsListSheet: () => null }));
vi.mock('@/components/profile/FollowersFollowingSheet', () => ({ FollowersFollowingSheet: () => <div>Follower data</div> }));
vi.mock('@/components/safety/ReportContentDialog', () => ({ ReportContentDialog: () => null }));
import ProfileView from './ProfileView';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); client = new QueryClient(); state.vm = { profile: { id: 'target', username: 'target', bio: 'Private biography' }, permissions: { ...DEFAULT_PERMISSIONS }, mode: 'not_friends',
  counts: { posts: null, followers: null, following: null, friends: null }, storyState: { hasStory: false }, score: { visible: false }, level: {}, menuActions: [], secondaryActions: [], featuredBadges: [], refetch: state.retry,
  isPending: false, isError: false } as unknown as ProfileViewModel; });
afterEach(() => { cleanup(); client.clear(); });
describe('profile route gates cached data and private children', () => {
  it('shows retry on failed authority even when a profile object was previously cached', () => {
    (state.vm as ProfileViewModel).isError = true; render(<ProfileView />, { wrapper });
    expect(screen.getByText('Profile unavailable')).toBeInTheDocument(); expect(screen.queryByText('Private biography')).not.toBeInTheDocument(); expect(screen.queryByText('Profile sections')).not.toBeInTheDocument();
    expect(state.stories).not.toHaveBeenCalled(); expect(state.section.mock.calls.every(call => call[1] === false)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry profile' })); expect(state.retry).toHaveBeenCalledOnce();
  });
  it('does not mount hidden story/about/list data even when their controls are invoked', () => {
    render(<ProfileView />, { wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Open followers' }));
    expect(screen.queryByText('Follower data')).not.toBeInTheDocument(); expect(screen.queryByText('About sheet')).not.toBeInTheDocument(); expect(screen.queryByText('Story highlights')).not.toBeInTheDocument(); expect(state.stories).not.toHaveBeenCalled();
  });
  it('retains the allowed story ring and permits an explicitly shared follow list', () => {
    (state.vm as ProfileViewModel).permissions = { ...DEFAULT_PERMISSIONS, stories: true, followers: true };
    render(<ProfileView />, { wrapper }); expect(state.stories).toHaveBeenCalledWith('target'); fireEvent.click(screen.getByRole('button', { name: 'Open followers' })); expect(screen.getByText('Follower data')).toBeInTheDocument();
  });
  it('suppresses a rejected block error after leaving the profile route', async () => {
    let reject!: (error: Error) => void;
    state.block.mockReturnValue(new Promise((_resolve, no) => { reject = no; }));
    const view = render(<ProfileView />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Block account' }));
    expect(state.block).toHaveBeenCalledExactlyOnceWith({ blockerId: 'a', blockedId: 'target', context: 'profile view' });
    view.unmount();
    await act(async () => { reject(new Error('Network unavailable')); });
    expect(state.error).not.toHaveBeenCalled();
  });
});
