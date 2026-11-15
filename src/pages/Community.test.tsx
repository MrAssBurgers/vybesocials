import type { ReactNode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Community from './Community';

const fixture = vi.hoisted(() => ({
  mine: [] as any[], publicRows: [] as any[], servers: {} as Record<string, any>, rooms: {} as Record<string, any[]>,
  mineError: false, publicError: false, selectedError: false, roomsError: false, selectedLoading: false,
  refetchMine: vi.fn(), refetchPublic: vi.fn(), refetchSelected: vi.fn(), refetchRooms: vi.fn(),
  session: { uid: 'preview-alice', epoch: 1 },
}));
vi.mock('@/hooks/useCommunitySession', () => ({ useCommunitySession: () => ({ session: fixture.session, ready: true }) }));
vi.mock('@/hooks/useCommunityRequest', () => ({ useCommunityRequest: () => vi.fn() }));
vi.mock('@/hooks/useCommunityMutation', () => ({ useCommunityMutation: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'preview-alice' } }) }));
vi.mock('@/hooks/useCommunities', () => ({
  useMyCommunities: () => ({ data: fixture.mine, isLoading: false, isError: fixture.mineError, refetch: fixture.refetchMine }),
  usePublicCommunities: () => ({ data: fixture.publicRows, isLoading: false, isError: fixture.publicError, refetch: fixture.refetchPublic }),
  useCommunity: (id?: string) => ({ data: id ? fixture.servers[id] : null, isLoading: fixture.selectedLoading, isError: fixture.selectedError, refetch: fixture.refetchSelected }),
  useRooms: (id?: string) => ({ data: fixture.rooms[id || ''] || [], isLoading: false, isError: fixture.roomsError, refetch: fixture.refetchRooms }),
  useJoinCommunity: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useServerNotifications', () => ({ useUnreadCountPerServer: () => ({ data: {} }) }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (value: string) => value }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/components/community/CommunityOrbitBar', () => ({ CommunityOrbitBar: () => null }));
vi.mock('@/components/community/CreateServerDialog', () => ({ CreateServerDialog: () => null }));
vi.mock('@/components/community/JoinServerDialog', () => ({ JoinServerDialog: ({ open, initialCode }: any) => open ? <p>Invitation: {initialCode}</p> : null }));
vi.mock('@/components/community/CommunityCard', () => ({ CommunityCard: ({ community, onClick }: any) => <button onClick={onClick}>Open {community.name}</button>, PublicCommunityCard: ({ community }: any) => <p>{community.name}</p> }));
vi.mock('@/components/community/CommunityShell', () => ({ CommunityShell: (props: any) => <section aria-label="Selected community"><h1>{props.selectedCommunity.name}</h1><output aria-label="Selected room">{props.selectedRoomId || ''}</output><button onClick={props.onBackToList}>Back to communities</button></section> }));
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const components = new Map(); const motionProps = new Set(['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap']);
  return { AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>, motion: new Proxy({}, { get: (_, tag: string) => {
    if (!components.has(tag)) components.set(tag, (props: Record<string, unknown>) => createElement(tag, Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)))));
    return components.get(tag);
  } }) };
});

function Navigation() {
  const location = useLocation(), navigate = useNavigate();
  return <nav><output aria-label="Current route">{location.pathname}{location.search}</output><button onClick={() => navigate('/community?community=beta&room=beta-chat')}>Open Beta link</button><button onClick={() => navigate('/community?community=beta')}>Open Beta without room</button><button onClick={() => navigate('/community?join=preview-invitation')}>Open invitation link</button><button onClick={() => navigate(-1)}>Browser back</button></nav>;
}
function show(path = '/community') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><Navigation /><Community /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.mineError = false; fixture.publicError = false; fixture.selectedError = false; fixture.roomsError = false; fixture.selectedLoading = false;
  fixture.servers = Object.fromEntries(['alpha', 'beta'].map(id => [id, { id, name: id === 'alpha' ? 'Alpha club' : 'Beta club', myRole: 'member' }]));
  fixture.mine = Object.values(fixture.servers); fixture.publicRows = [];
  fixture.rooms = Object.fromEntries(['alpha', 'beta'].map(id => [id, [{ id: `${id}-chat`, community_id: id, room_type: 'chat' }]]));
});
afterEach(cleanup);

describe('community route selection and read feedback', () => {
  it('accepts a legacy server/channel link', () => {
    show('/community?server=alpha&channel=alpha-chat');
    expect(screen.getByRole('heading', { name: 'Alpha club' })).toBeInTheDocument();
    expect(screen.getByLabelText('Selected room')).toHaveTextContent('alpha-chat');
  });
  it('opens a new invitation while the list is already mounted and removes its code from the URL', async () => {
    const user = userEvent.setup(); show();
    await user.click(screen.getByRole('button', { name: 'Open invitation link' }));
    expect(screen.getByText('Invitation: preview-invitation')).toBeInTheDocument();
    expect(screen.getByLabelText('Current route').textContent).not.toContain('join=');
  });
  it('follows a new community link without requiring a page reload', async () => {
    const user = userEvent.setup(); show('/community?community=alpha&room=alpha-chat');
    await user.click(screen.getByRole('button', { name: 'Open Beta link' }));
    expect(screen.getByRole('heading', { name: 'Beta club' })).toBeInTheDocument();
    expect(screen.getByLabelText('Selected room')).toHaveTextContent('beta-chat');
  });
  it('returns to the list with browser back after choosing a community', async () => {
    const user = userEvent.setup(); show();
    await user.click(screen.getByRole('button', { name: 'Open Alpha club' }));
    expect(screen.getByRole('heading', { name: 'Alpha club' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    expect(screen.getByRole('button', { name: 'Open Alpha club' })).toBeInTheDocument();
    expect(screen.getByLabelText('Current route')).toHaveTextContent('/community');
    expect(screen.getByLabelText('Current route').textContent).not.toContain('room=');
  });
  it('never defaults a room from another community while current rooms are unavailable', async () => {
    const user = userEvent.setup(); fixture.rooms.beta = fixture.rooms.alpha; show();
    await user.click(screen.getByRole('button', { name: 'Open Beta without room' }));
    expect(screen.getByRole('heading', { name: 'Beta club' })).toBeInTheDocument();
    expect(screen.getByLabelText('Selected room')).toBeEmptyDOMElement();
    expect(screen.getByLabelText('Current route').textContent).not.toContain('alpha-chat');
  });
  it('offers retry when the owned list fails instead of claiming there are no communities', async () => {
    const user = userEvent.setup(); fixture.mine = []; fixture.mineError = true; show();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your communities");
    expect(screen.queryByText('No communities yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry communities' })); expect(fixture.refetchMine).toHaveBeenCalledOnce();
  });
  it('waits for a checked list rather than treating unavailable data as an empty account', () => {
    fixture.mine = undefined as any; show();
    expect(screen.getByRole('status', { name: 'Loading your communities' })).toBeInTheDocument();
    expect(screen.queryByText('No communities yet')).not.toBeInTheDocument();
  });
  it('names the discovery search and offers retry for failed public reads', async () => {
    const user = userEvent.setup(); fixture.publicError = true; show();
    await user.click(screen.getByRole('tab', { name: 'Discover' }));
    expect(screen.getByRole('searchbox', { name: 'Search communities' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load public communities");
    expect(screen.queryByText('No public communities yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry public communities' })); expect(fixture.refetchPublic).toHaveBeenCalledOnce();
  });
  it('shows selected-community failure with a route back instead of an unrelated list', async () => {
    const user = userEvent.setup(); fixture.selectedError = true; delete fixture.servers.alpha;
    show('/community?community=alpha');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this community");
    await user.click(screen.getByRole('button', { name: 'Retry community' })); expect(fixture.refetchSelected).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Back to communities' }));
    expect(screen.getByLabelText('Current route').textContent).not.toContain('community=alpha');
  });
  it('reports failed channel reads rather than showing an empty working shell', () => {
    fixture.roomsError = true; fixture.rooms.alpha = []; show('/community?community=alpha');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load community channels");
    expect(screen.getByRole('button', { name: 'Retry channels' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected community' })).not.toBeInTheDocument();
  });
});
