import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, ready: true, create: vi.fn(), start: vi.fn(), navigate: vi.fn(), error: vi.fn(), friendship: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => { const session = state.session; const ready = state.ready; return { ready, user: { id: session.uid }, profile: { id: `${session.uid}-p` }, session, guard: () => { if (!ready || session.uid !== state.session.uid || session.epoch !== state.session.epoch) throw Object.assign(new Error('changed'), { code: 'account-changed' }); } }; } }));
vi.mock('@/lib/firebase/chats', () => ({ createDmChat: state.create }));
vi.mock('@/lib/profileFriendshipAction', () => ({ profileFriendshipAction: state.friendship }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/lib/callStore', () => ({ useCallStore: () => ({ state: { phase: 'idle' }, startCall: state.start }) }));
vi.mock('@/contexts/cameraOverlaySafe', () => ({ useCameraOverlayOptional: () => null }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: vi.fn() } }));
import { ProfilePrimaryActions } from './ProfilePrimaryActions';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const props = { profile: { id: 'target', username: 'target' }, mode: 'friend' as const, primaryAction: 'message' as const, secondaryActions: [] };
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.ready = true; client = new QueryClient(); state.create.mockResolvedValue('chat'); });
afterEach(() => { cleanup(); client.clear(); });
describe('profile action lifetime', () => {
  it('opens a chat with the captured guard only after confirmation', async () => {
    render(<ProfilePrimaryActions {...props} />, { wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    await act(async () => {}); expect(state.create).toHaveBeenCalledExactlyOnceWith('target', expect.any(Function)); expect(state.navigate).toHaveBeenCalledWith('/messages/chat');
  });
  it('prevents duplicate chat submissions while discovery is pending', () => {
    state.create.mockReturnValue(new Promise(() => {})); render(<ProfilePrimaryActions {...props} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Chat' })); fireEvent.click(screen.getByRole('button', { name: 'Chat' })); expect(state.create).toHaveBeenCalledTimes(1);
  });
  it('never starts a call or navigates from an old account completion', async () => {
    let finish!: (id: string) => void; state.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<ProfilePrimaryActions {...props} />, { wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    state.session = { uid: 'alice', epoch: 3 }; await act(async () => { finish('old-chat'); });
    expect(state.start).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
  it('stops navigation after the route unmounts', async () => {
    let finish!: (id: string) => void; state.create.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<ProfilePrimaryActions {...props} />, { wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Chat' })); view.unmount();
    await act(async () => { finish('old-chat'); }); expect(state.navigate).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
  it('refuses a stale profile before discovery or mutation', async () => {
    state.ready = false; render(<ProfilePrimaryActions {...props} />, { wrapper }); fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    await act(async () => {}); expect(state.create).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
});
