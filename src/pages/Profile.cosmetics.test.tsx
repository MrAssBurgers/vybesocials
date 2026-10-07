import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { FRAME_CLASS_MAP, THEME_GRADIENTS } from '@/lib/cosmeticConstants';
const mock = vi.hoisted(() => ({ target:'alice', markRead:vi.fn(), theme: 'theme_neon', frame: 'avatar_frame_gold', hasWallpaper: true, setBackground: vi.fn(), refreshBackground: vi.fn(), unavailable: [] as string[], removeSaved: vi.fn(), removeError: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, authReady: true, profile: { id: 'alice-profile', user_id: 'alice', username: 'alice' } }) }));
vi.mock('@/hooks/useProfile', () => ({ useProfileByUsername: () => ({ data: { id: `${mock.target}-profile`, user_id: mock.target, username: mock.target } }), useFollow: () => ({}), useUpdateAvatar: () => ({}) }));
vi.mock('@/lib/firebase',()=>({db:{from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})})}}));
vi.mock('@/hooks/usePosts', () => ({ usePosts: () => ({ data: [] }) }));
vi.mock('@/hooks/useSavedPosts', () => ({ useSavedPosts: () => ({ data: [], unavailableSavedPostIds: mock.unavailable }), useRemoveSavedPost: () => ({ mutate: mock.removeSaved, isPending: false, isError: mock.removeError }) }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => ({}) }));
vi.mock('@/hooks/useMessages', () => ({ useMarkConversationReadByUser: () => ({ mutate: mock.markRead }) }));
vi.mock('@/hooks/useUserRoleById', () => ({ useUserRoleById: () => ({ data: null }) }));
vi.mock('@/hooks/useBadges', () => ({ useUserBadges: () => ({ data: [] }), useUserPrimaryBadge: () => ({ data: null }) }));
vi.mock('@/hooks/useLockerItems', () => ({ useLockerItems: () => ({ data: { equippedProfileTheme: mock.theme, equippedFrame: mock.frame } }) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: false }) }));
vi.mock('@/hooks/useLiveMusicPresence', () => ({ useLiveMusicPresence: () => ({ presence: null }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children, contentOwnsBottomPadding }: { children: ReactNode; contentOwnsBottomPadding?: boolean }) => <main style={{ transform: 'translateZ(0)', overflowY: 'auto', height: '720px', paddingBottom: contentOwnsBottomPadding ? undefined : '34px' }}>{children}</main> }));
vi.mock('@/components/layout/AppBackground', () => ({ useAppBackground: () => ({ setBackgroundImage: mock.setBackground, refreshBackground: mock.refreshBackground, hasUserWallpaper: mock.hasWallpaper }) }));
vi.mock('@/components/profile/ProfileHeroCard', () => ({ ProfileHeroCard: ({ frameClass }: { frameClass: string }) => <div data-testid="profile-avatar" className={frameClass} /> }));
vi.mock('@/components/profile/ProfileLocker', () => ({ ProfileLocker: () => <section aria-label="Purchased profile items" style={{ minHeight: '1500px' }}>Owned profile effects</section> }));
vi.mock('@/components/profile/ProfileAboutMe', () => ({ ProfileAboutMe: () => null }));
vi.mock('@/components/profile/ProfileAboutDetails', () => ({ ProfileAboutDetails: () => null }));
vi.mock('@/components/profile/ProfileVibeBoard', () => ({ ProfileVibeBoard: () => null }));
vi.mock('@/components/music/NowPlayingCard', () => ({ NowPlayingCard: () => null }));
vi.mock('@/components/ui/VideoThumbnail', () => ({ VideoThumbnail: () => null }));
vi.mock('@/components/posts/ClipsGrid', () => ({ ClipsGrid: () => null }));
vi.mock('@/components/growth/GuestJoinBanner', () => ({ GuestJoinBanner: () => null }));
vi.mock('@/components/moderation/ModeratorActionsMenu', () => ({ useIsModOrAdmin: () => false, ModeratorDialogs: () => null }));
vi.mock('@/components/premium/PremiumMemeBanItems', () => ({ PremiumMemeBanDialog: () => null }));
import Profile from './Profile';
beforeEach(() => { vi.clearAllMocks(); mock.target='alice'; mock.hasWallpaper = true; mock.unavailable = []; mock.removeError = false; });
afterEach(cleanup);
describe('profile visits preserve unread direct messages',()=>{
  it('does not mark a direct conversation as read when another profile is viewed or changes',()=>{
    mock.target='bob'; const view=render(<MemoryRouter><Profile /></MemoryRouter>);
    expect(screen.getByTestId('profile-avatar')).toBeInTheDocument();
    expect(mock.markRead).not.toHaveBeenCalled();
    mock.target='charlie';view.rerender(<MemoryRouter><Profile /></MemoryRouter>);
    expect(mock.markRead).not.toHaveBeenCalled();
  });
});
describe('profile renders purchased cosmetics', () => {
  it.each([['theme_neon', 'avatar_frame_gold'], ['theme_ocean', 'avatar_frame_fire']])('renders %s from equipped ID and passes the actual avatar frame style', (theme, frame) => {
    mock.theme = theme; mock.frame = frame;
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    const gradient = Array.from(view.container.querySelectorAll<HTMLElement>('[style]')).find(node => node.style.background.includes('linear-gradient'));
    expect(gradient).toHaveStyle({ background: THEME_GRADIENTS[theme] });
    expect(gradient).toHaveStyle({ opacity: '0.35' });
    expect(gradient?.parentElement).toHaveClass('absolute', 'inset-0', 'pointer-events-none');
    expect(screen.getByTestId('profile-avatar').className).toBe(FRAME_CLASS_MAP[frame]);
    // Profile colors do not set, delete, or replace the user's global wallpaper.
    expect(mock.setBackground).not.toHaveBeenCalled();
    expect(mock.refreshBackground).not.toHaveBeenCalled();
  });
  it.each(['theme_neon', 'theme_ocean'])('uses the full %s gradient when no wallpaper is present', theme => {
    mock.theme = theme; mock.hasWallpaper = false;
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    const gradient = Array.from(view.container.querySelectorAll<HTMLElement>('[style]')).find(node => node.style.background.includes('linear-gradient'));
    expect(gradient).toHaveStyle({ background: THEME_GRADIENTS[theme] });
    expect(gradient?.style.opacity).toBe('');
  });
  it('leaves an existing non-marketplace gradient theme unchanged even with a wallpaper', () => {
    mock.theme = 'Obsidian';
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    const gradient = Array.from(view.container.querySelectorAll<HTMLElement>('[style]')).find(node => node.style.background.includes('linear-gradient'));
    expect(gradient).toHaveStyle({ background: THEME_GRADIENTS.Obsidian });
    expect(gradient?.style.opacity).toBe('');
  });
  it('anchors the effect to the growing profile content inside a transformed scroller', () => {
    mock.theme = 'theme_neon';
    const { container } = render(<MemoryRouter><Profile /></MemoryRouter>);
    const surface = container.querySelector('.profile-effect-surface')!;
    const background = surface.querySelector('[aria-hidden="true"].pointer-events-none')!;
    expect(surface).toHaveClass('relative', 'isolate', 'min-h-[100dvh]');
    expect(background.parentElement).toBe(surface);
    expect(background).toHaveClass('absolute', 'inset-0');
    expect(background).not.toHaveClass('fixed');
    expect(surface).toContainElement(screen.getByTestId('profile-avatar'));
    fireEvent.click(screen.getByRole('button', { name: 'Locker' }));
    // The long tab must determine the same containing block's height. A sibling
    // viewport-sized fixed layer would end partway through this content.
    expect(surface).toContainElement(screen.getByRole('region', { name: 'Purchased profile items' }));
    expect(surface.querySelector('[aria-hidden="true"].pointer-events-none')).toBe(background);
    expect(background).toHaveStyle({ zIndex: '0' });
    expect(surface.querySelector('.profile-page-shell')).toHaveStyle({ zIndex: '1' });
    expect(container.querySelector('main')!.style.paddingBottom).toBe('');
    expect((surface.querySelector('.profile-page-shell') as HTMLElement).style.paddingBottom).toBe('calc(7rem + var(--sab, env(safe-area-inset-bottom, 0px)))');
    expect(mock.setBackground).not.toHaveBeenCalled();
  });
});

describe('unavailable saved posts remain removable without revealing old contents', () => {
  it('shows a neutral saved reference and retries removal without an empty saved-list claim', () => {
    mock.unavailable = ['denied-post']; mock.removeError = true;
    render(<MemoryRouter><Profile /></MemoryRouter>); fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(screen.getByText('Saved post is unavailable')).toBeInTheDocument(); expect(screen.queryByText('No saved posts yet')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not remove this saved post');
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved post' })); expect(mock.removeSaved).toHaveBeenCalledWith('denied-post');
    expect(screen.queryByRole('link', { name: /denied/i })).not.toBeInTheDocument();
  });
});
