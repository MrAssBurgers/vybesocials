import type { ReactNode } from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import NotificationsPage from './Notifications';

vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ data: [], refetch: vi.fn() }), useMarkNotificationsRead: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useAnnouncements', () => ({ useRecentAnnouncements: () => ({ data: [] }) }));
vi.mock('@/hooks/useFriends', () => ({ useFriendRequests: () => ({ data: { incoming: [] }, refetch: vi.fn() }), useRespondToFriendRequest: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useMessages', () => ({ useCreateConversation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useChatPrefetch', () => ({ useChatPrefetch: () => ({ prefetchConversation: vi.fn() }) }));
vi.mock('@/hooks/usePullToRefresh', () => ({ usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false }) }));
vi.mock('@/hooks/useMouthZoomTransition', () => ({ useNotificationHoverPrefetch: () => ({}) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/notifications/MouthZoomTransition', () => ({ MouthZoomProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useMouthZoom: vi.fn() }));
vi.mock('@/components/notifications/NotificationTransitionProvider', () => ({ NotificationTransitionProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useNotificationTransition: vi.fn() }));
vi.mock('@/components/notifications/SmartPingCard', () => ({ SmartPingCard: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => null }));
vi.mock('@/components/ui/EmptyState', () => ({ EmptyState: ({ title }: { title: string }) => <p>{title}</p> }));
afterEach(cleanup);

function LocationControls() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="Current route">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
function show(path: string) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><LocationControls /><NotificationsPage /></MemoryRouter></QueryClientProvider>);
}

describe('notification deep-linked tabs', () => {
  it('opens the requests tab from a friend-request notification link', () => {
    show('/notifications?tab=requests');
    expect(screen.getByRole('tab', { name: 'Requests' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('No requests')).toBeInTheDocument();
  });
  it('preserves other parameters and follows browser back when changing tabs', async () => {
    show('/notifications?tab=requests&source=push');
    await userEvent.click(screen.getByRole('tab', { name: 'Priority' }));
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/notifications?tab=priority&source=push');
    fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByRole('tab', { name: 'Requests' })).toHaveAttribute('aria-selected', 'true');
  });
  it('falls back to All for unknown tab values', () => {
    show('/notifications?tab=not-a-tab');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
  });
});
