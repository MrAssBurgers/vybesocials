import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: { uid: 'alice', epoch: 1 }, mutate: vi.fn(), refetch: vi.fn(), more: vi.fn(), error: false, loading: false, selected: false,
}));
vi.mock('@/hooks/useStories', () => ({ useCloseFriends: () => ({
  data: state.error ? undefined : state.selected ? [{ id: 'proof', friend: { id: 'p-bob', username: 'bob', display_name: 'Bob' } }] : [],
  candidates: state.error ? [] : [{ id: 'p-bob', username: 'bob', display_name: 'Bob' }],
  legacyReview: true, hasNextPage: true, isFetchingNextPage: false, isLoading: state.loading, isError: state.error,
  fetchNextPage: state.more, refetch: state.refetch,
}), useManageCloseFriend: () => ({ mutateAsync: state.mutate, isPending: false }) }));
vi.mock('@/hooks/useStoryAccount', () => ({ useStoryAccount: () => {
  const epoch = state.session.epoch; return { session: state.session, guard: () => { if (epoch !== state.session.epoch) throw new Error('Account changed'); } };
} }));
import { CloseFriendsManager } from './CloseFriendsManager';
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.error = false; state.loading = false; state.selected = false; state.mutate.mockResolvedValue({}); });
afterEach(cleanup);
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Manage Close Friends' }));
describe('deliberate Close Friends controls', () => {
  it('does not auto-adopt historical selections and adds only after explicit choice', async () => {
    render(<CloseFriendsManager />); open();
    expect(screen.getByText(/Previous selections need reconfirmation/)).toBeTruthy(); expect(state.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add bob to Close Friends' }));
    await screen.findByText('Close friend added.'); expect(state.mutate).toHaveBeenCalledWith({ friendId: 'p-bob', action: 'add' });
  });
  it('keeps failed selections open for retry without claiming success', async () => {
    state.mutate.mockRejectedValueOnce(new Error('Change not confirmed'));
    render(<CloseFriendsManager />); open(); fireEvent.click(screen.getByRole('button', { name: 'Add bob to Close Friends' }));
    await screen.findByText('Change not confirmed'); expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.queryByText('Close friend added.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add bob to Close Friends' })); await screen.findByText('Close friend added.'); expect(state.mutate).toHaveBeenCalledTimes(2);
  });
  it('keeps removal available for existing selections and loads more candidates deliberately', async () => {
    state.selected = true; render(<CloseFriendsManager />); open();
    fireEvent.click(screen.getByRole('button', { name: 'More friends' })); expect(state.more).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove bob from Close Friends' })); await screen.findByText('Close friend removed.');
    expect(state.mutate).toHaveBeenCalledWith({ friendId: 'p-bob', action: 'remove' });
  });
  it('shows a list failure with retry and no old names or editing controls', () => {
    state.error = true; render(<CloseFriendsManager />); open(); expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
    expect(screen.queryByText('Bob')).toBeNull(); expect(screen.queryByRole('button', { name: /Add bob/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Close Friends' })); expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('closes account-specific content and ignores late success after an ABA switch', async () => {
    let resolve!: () => void; state.mutate.mockReturnValue(new Promise<void>(yes => { resolve = yes; }));
    const view = render(<CloseFriendsManager />); open(); fireEvent.click(screen.getByRole('button', { name: 'Add bob to Close Friends' }));
    state.session = { uid: 'alice', epoch: 3 }; view.rerender(<CloseFriendsManager />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); await act(async () => { resolve(); });
    open(); expect(screen.queryByText('Close friend added.')).toBeNull(); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('Escape returns keyboard focus to the trigger', async () => {
    render(<CloseFriendsManager />); const trigger = screen.getByRole('button', { name: 'Manage Close Friends' }); open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
