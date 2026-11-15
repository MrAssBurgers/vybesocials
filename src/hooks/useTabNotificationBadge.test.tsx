import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ profileId: 'alice' as string | undefined, messages: 2 }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.profileId }));
vi.mock('@/hooks/useMessages', () => ({ useUnreadMessagesCount: () => ({ data: state.messages }) }));
vi.mock('@/hooks/useNotifications', () => ({ useUnreadCount: () => ({ data: 0 }) }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: vi.fn(), removeRealtimeChannel: vi.fn() }));
import { useTabNotificationBadge } from './useTabNotificationBadge';
import { usePageTitle } from './usePageTitle';

function Harness() {
  // Reproduce a global badge mounting before a route or lazy page's metadata.
  useTabNotificationBadge();
  usePageTitle();
  const navigate = useNavigate();
  return <><button onClick={() => navigate('/clips')}>Clips</button><button onClick={() => navigate('/messages/search')}>Search</button></>;
}
function setup() {
  const client = new QueryClient();
  const result = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/home']}><Harness /></MemoryRouter></QueryClientProvider>);
  return { ...result, client };
}
beforeEach(() => { document.title = 'Home · VYBE'; state.profileId = 'alice'; state.messages = 2; });
afterEach(cleanup);

describe('route titles with unread badges', () => {
  it('keeps the badge when route metadata runs after the badge effect', async () => {
    const { client } = setup();
    await waitFor(() => expect(document.title).toBe('(2) Home · VYBE'));
    fireEvent.click(screen.getByText('Clips'));
    await waitFor(() => expect(document.title).toBe('(2) Clips — Short videos on VYBE'));
    fireEvent.click(screen.getByText('Search'));
    await waitFor(() => expect(document.title).toBe('(2) Search Messages · VYBE'));
    client.clear();
  });
  it('uses later page metadata without reverting to the previous route', async () => {
    const { client } = setup();
    document.title = 'A specific conversation · VYBE';
    await waitFor(() => expect(document.title).toBe('(2) A specific conversation · VYBE'));
    client.clear();
  });
  it('does not decorate signed-out titles', async () => {
    state.profileId = undefined;
    const { client } = setup();
    document.title = 'Public VYBE page';
    await waitFor(() => expect(document.title).toBe('Public VYBE page'));
    client.clear();
  });
});
