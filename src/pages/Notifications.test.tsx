import type { ReactNode } from 'react';
import { cleanup, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import NotificationsPage from './Notifications';

const notificationsState = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ data: notificationsState.rows, refetch: vi.fn() }), useMarkNotificationsRead: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useAnnouncements', () => ({ useRecentAnnouncements: () => ({ data: [] }) }));
vi.mock('@/hooks/useFriends', () => ({ useFriendRequests: () => ({ data: { incoming: [] }, refetch: vi.fn() }), useRespondToFriendRequest: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useMessages', () => ({ useCreateConversation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useChatPrefetch', () => ({ useChatPrefetch: () => ({ prefetchConversation: vi.fn() }) }));
vi.mock('@/hooks/usePullToRefresh', () => ({ usePullToRefresh: () => ({ pullDistance: 0, isRefreshing: false }) }));
vi.mock('@/hooks/useMouthZoomTransition', () => ({ useNotificationHoverPrefetch: () => ({}) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/notifications/MouthZoomTransition', () => ({ MouthZoomProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useMouthZoom: () => ({ startTransition: vi.fn() }) }));
vi.mock('@/components/notifications/NotificationTransitionProvider', () => ({ NotificationTransitionProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useNotificationTransition: () => ({ triggerTransition: vi.fn() }) }));
vi.mock('@/components/notifications/SmartPingCard', () => ({ SmartPingCard: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => null }));
vi.mock('@/components/ui/EmptyState', () => ({ EmptyState: ({ title }: { title: string }) => <p>{title}</p> }));
afterEach(cleanup);
beforeEach(() => { notificationsState.rows = []; });

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

describe('map wave notifications', () => {
  const inbox = () => within(screen.getByRole('tabpanel', { name: 'All' }));
  function wave(extra = {}) {
    return { id: `map-wave-${'a'.repeat(64)}`, type: 'map_wave', read: false, created_at: new Date().toISOString(), post_id: null, title: 'Preview Alice', body: 'waved at you on VybeMap 👋', deep_link: 'https://untrusted.invalid/?private=value', meta: { conversationId: 'wrong-chat' }, actor: { id: 'alice-profile', username: 'alice', display_name: 'Current Alice', avatar_url: null }, ...extra };
  }
  it('shows the actual wave meaning and opens only /map without forwarding notification content', async () => {
    notificationsState.rows = [wave()]; show('/notifications');
    const row = inbox().getByRole('button', { name: /Preview Alice waved at you on VybeMap.*Open map/ });
    expect(row).toHaveTextContent('waved at you on VybeMap 👋');
    await userEvent.click(row); expect(screen.getByLabelText('Current route').textContent).toBe('/map');
  });
  it.each(['{Enter}', ' '])('opens the map with keyboard %s from the wave row', async key => {
    notificationsState.rows = [wave({ deep_link: '/messages/private?secret=1', title: '<img src=x onerror=alert(1)>' })]; show('/notifications');
    const row = inbox().getByRole('button', { name: /waved at you on VybeMap.*Open map/ }); row.focus();
    expect(row.querySelector('img')).toBeNull(); await userEvent.keyboard(key);
    expect(screen.getByLabelText('Current route').textContent).toBe('/map');
  });
  it('uses the current row after rerender and falls back to the resolved actor when title is absent', async () => {
    notificationsState.rows = [wave({ title: null })]; const view = show('/notifications');
    expect(inbox().getByRole('button', { name: /Current Alice waved/ })).toBeInTheDocument();
    notificationsState.rows = [wave({ id: 'another-wave', title: 'Preview Bob' })];
    view.rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/notifications']}><LocationControls /><NotificationsPage /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(inbox().queryByRole('button', { name: /Current Alice waved/ })).toBeNull());
    await userEvent.click(inbox().getByRole('button', { name: /Preview Bob waved/ })); expect(screen.getByLabelText('Current route').textContent).toBe('/map');
  });
});
