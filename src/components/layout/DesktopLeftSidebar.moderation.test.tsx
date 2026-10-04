import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ count: undefined as number | undefined, error: false, role: 'admin' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: null, signOut: vi.fn() }) }));
vi.mock('@/hooks/useModeration', () => ({ useUserRole: () => ({ data: state.role }) }));
vi.mock('@/hooks/usePendingModerationCount', () => ({ usePendingModerationCount: () => ({ data: state.count, isError: state.error }) }));
vi.mock('@/hooks/useNotifications', () => ({ useUnreadCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/useMessages', () => ({ useUnreadMessagesCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/useServers', () => ({ useMyServers: () => ({ data: [] }) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: false }) }));
vi.mock('@/contexts/DebugPanelContext', () => ({ useDebugPanel: () => null }));
vi.mock('@/components/hub/VYBEHub', () => ({ VYBEHub: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => null }));
vi.mock('@/components/ui/OwnerBadge', () => ({ OwnerBadge: () => null, isOwner: () => false }));
vi.mock('@/lib/routePreloader', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/lib/navFeedback', () => ({ triggerNavFeedback: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/sounds', () => ({ playSound: vi.fn() }));
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
beforeEach(() => { state.count = undefined; state.error = false; state.role = 'admin'; });
afterEach(cleanup);
function show(collapsed = false) { return render(<MemoryRouter><DesktopLeftSidebar collapsed={collapsed} onCollapsedChange={() => {}} /></MemoryRouter>); }
describe('moderation count availability', () => {
  it.each([true, false])('shows an accessible unavailable badge when collapsed=%s', collapsed => {
    state.error = true;
    // A previous successful count must not disguise a failed refresh.
    state.count = 7;
    show(collapsed);
    expect(screen.getByRole('status', { name: 'Moderation count unavailable' })).toHaveTextContent('?');
    expect(screen.getByTitle('Moderation count unavailable').closest('a')).toHaveAttribute('href', '/admin');
  });
  it.each([4, 23])('preserves confirmed numeric badges for %s pending items', count => {
    state.count = count; show();
    const link = screen.getByRole('link', { name: /sidebar.adminPanel/ });
    expect(link).toHaveTextContent(count > 9 ? '9+' : String(count));
    expect(screen.queryByRole('status', { name: 'Moderation count unavailable' })).not.toBeInTheDocument();
  });
  it('does not display a failure indicator for a confirmed empty queue or to regular users', () => {
    state.count = 0;
    const { unmount } = show();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    unmount(); state.role = 'user'; state.error = true;
    show();
    expect(screen.queryByRole('link', { name: /sidebar.adminPanel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
