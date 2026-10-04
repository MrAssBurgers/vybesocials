import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, read: vi.fn(), write: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => { const session = state.session; return { ready: true, user: { id: session.uid }, profile: { id: `${session.uid}-p` }, session, guard: () => { if (session.uid !== state.session.uid || session.epoch !== state.session.epoch) throw Object.assign(new Error('changed'), { code: 'account-changed' }); } }; } }));
vi.mock('@/lib/profileVisibilitySettings', () => ({ readVisibilitySettings: state.read, writeVisibilitySetting: state.write }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { FriendProfileVisibilityCard } from './FriendProfileVisibilityCard';
import { PROFILE_VISIBILITY_DEFAULTS } from '@/lib/profileVisibility';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const value = () => ({ fields: { ...PROFILE_VISIBILITY_DEFAULTS }, needsRepair: false });
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); state.read.mockResolvedValue(value()); state.write.mockResolvedValue(value()); });
afterEach(() => { cleanup(); client.clear(); });
describe('profile visibility settings controls', () => {
  it('shows a load failure with retry instead of editable defaults', async () => {
    state.read.mockRejectedValue(new Error('offline')); render(<FriendProfileVisibilityCard />, { wrapper });
    await screen.findByText('Your privacy settings could not be loaded. Nothing has been changed.');
    expect(screen.queryByRole('button', { name: 'Everyone' })).not.toBeInTheDocument(); expect(state.write).not.toHaveBeenCalled();
    state.read.mockResolvedValue(value()); fireEvent.click(screen.getByRole('button', { name: 'Retry settings' })); await screen.findByRole('group', { name: 'Bio' });
  });
  it('routes Close friends to a real field update and prevents duplicate writes', async () => {
    let finish!: (result: unknown) => void; state.write.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<FriendProfileVisibilityCard />, { wrapper }); const group = await screen.findByRole('group', { name: 'Bio' });
    const button = within(group).getByRole('button', { name: 'Close friends' }); fireEvent.click(button); fireEvent.click(button);
    expect(state.write).toHaveBeenCalledTimes(1); expect(state.write).toHaveBeenCalledWith('alice-p', { field: 'bio', level: 'close_friends' }, expect.any(Function));
    expect(within(group).getByRole('button', { name: 'Everyone' })).toBeDisabled();
    await act(async () => { finish({ fields: { ...PROFILE_VISIBILITY_DEFAULTS, bio: 'close_friends' }, needsRepair: false }); });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });
  it('requires an explicit repair action for unavailable saved choices', async () => {
    state.read.mockResolvedValue({ fields: { ...PROFILE_VISIBILITY_DEFAULTS, bio: 'unavailable' }, needsRepair: true });
    render(<FriendProfileVisibilityCard />, { wrapper }); await screen.findByText('Unavailable until repaired');
    expect(within(screen.getByRole('group', { name: 'Bio' })).getByRole('button', { name: 'Everyone' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Repair unavailable options' }));
    expect(state.write).toHaveBeenCalledWith('alice-p', { repair: true }, expect.any(Function));
  });
  it('suppresses stale save feedback and cache updates across A to B to A', async () => {
    let finish!: (result: unknown) => void; state.write.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<FriendProfileVisibilityCard />, { wrapper }); const group = await screen.findByRole('group', { name: 'Bio' });
    fireEvent.click(within(group).getByRole('button', { name: 'Everyone' }));
    state.session = { uid: 'alice', epoch: 3 }; view.rerender(<FriendProfileVisibilityCard />);
    await screen.findByRole('group', { name: 'Bio' }); await act(async () => { finish({ fields: { ...PROFILE_VISIBILITY_DEFAULTS, bio: 'public' }, needsRepair: false }); });
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
    expect(within(screen.getByRole('group', { name: 'Bio' })).getByRole('button', { name: 'Friends' })).toHaveAttribute('aria-pressed', 'true');
  });
});
