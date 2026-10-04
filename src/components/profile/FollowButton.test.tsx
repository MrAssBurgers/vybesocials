import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({ state: 'none', guard: vi.fn(), save: vi.fn(), refetch: vi.fn(), success: vi.fn(), error: vi.fn(), blocked: false, failed: false }));
vi.mock('@/hooks/useFollowAuthority', () => ({ useFollowAuthority: () => ({ ready: true, profile: { id: 'alice' }, guard: mock.guard,
  query: { data: { state: mock.state, privateAccount: true, relationshipId: 'a'.repeat(64), revision: 3, blocked: mock.blocked }, isLoading: false, isError: mock.failed, refetch: mock.refetch },
  mutation: { mutateAsync: mock.save, isPending: false } }) }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('@/lib/haptics', () => ({ haptics: { success: vi.fn() } }));
import { FollowButton } from './FollowButton';
beforeEach(() => { vi.clearAllMocks(); mock.state = 'none'; mock.blocked = false; mock.failed = false; mock.guard.mockImplementation(() => {}); });
afterEach(cleanup);
describe('acknowledged follow button', () => {
  it('announces a request only after its server acknowledgement', async () => {
    let finish!: (value: unknown) => void; mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<FollowButton targetId="bob" />); fireEvent.click(screen.getByRole('button', { name: 'Request to follow' }));
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.save).toHaveBeenCalledWith({ action: 'request', targetId: 'bob', revision: 3 });
    finish({ state: 'pending' }); await waitFor(() => expect(mock.success).toHaveBeenCalledWith('Follow request sent'));
  });
  it('cancels the displayed revision and blocks repeated clicks in flight', async () => {
    mock.state = 'pending'; mock.save.mockReturnValue(new Promise(() => {})); render(<FollowButton targetId="bob" compact />);
    const button = screen.getByRole('button', { name: 'Cancel request' }); fireEvent.click(button); fireEvent.click(button);
    expect(mock.save).toHaveBeenCalledTimes(1); expect(mock.save).toHaveBeenCalledWith({ action: 'unfollow', relationshipId: 'a'.repeat(64), revision: 3 });
  });
  it('does not announce success after the account or target changes', async () => {
    let finish!: (value: unknown) => void; mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<FollowButton targetId="bob" />); fireEvent.click(screen.getByRole('button', { name: 'Request to follow' })); view.rerender(<FollowButton targetId="carol" />);
    finish({ state: 'following' }); await waitFor(() => expect(mock.guard).toHaveBeenCalledTimes(3)); expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  });
  it('retries a failed read without submitting an assumed follow state', () => {
    mock.failed = true; render(<FollowButton targetId="bob" />); fireEvent.click(screen.getByRole('button', { name: 'Retry follow status' })); expect(mock.refetch).toHaveBeenCalled(); expect(mock.save).not.toHaveBeenCalled();
  });
});
