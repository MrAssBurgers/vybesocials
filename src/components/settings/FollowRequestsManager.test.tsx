import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mock = vi.hoisted(() => ({ save: vi.fn(), guard: vi.fn(), refetch: vi.fn(), more: vi.fn(), error: false, next: false, rows: [] as unknown[] }));
vi.mock('@/hooks/useFollowAuthority', () => ({
  useFollowAuthority: () => ({ ready: true, session: { uid: 'alice', epoch: 1 }, guard: mock.guard, mutation: { mutateAsync: mock.save, isPending: false } }),
  useFollowManagement: () => ({ data: { pages: [{ relationships: mock.rows }] }, isLoading: false, isError: mock.error, hasNextPage: mock.next, isFetchingNextPage: false, refetch: mock.refetch, fetchNextPage: mock.more }),
}));
import { FollowRequestsManager } from './FollowRequestsManager';
const row = { relationshipId: 'b'.repeat(64), revision: 7, status: 'pending', canApprove: true, follower: { id: 'bob', username: 'bob', displayName: 'Bob' } };
beforeEach(() => { vi.clearAllMocks(); mock.error = false; mock.next = false; mock.rows = [row]; mock.guard.mockImplementation(() => {}); });
afterEach(cleanup);
function open() { render(<FollowRequestsManager />); fireEvent.click(screen.getByRole('button', { name: 'Followers & requests' })); }
describe('follow owner decisions', () => {
  it('approves the displayed request revision and waits for acknowledgement', async () => {
    let finish!: (value: unknown) => void; mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; })); open();
    fireEvent.click(screen.getByRole('button', { name: 'Approve bob' }));
    expect(mock.save).toHaveBeenCalledWith({ action: 'approve', relationshipId: row.relationshipId, revision: 7 }); expect(screen.queryByText('Request approved.')).not.toBeInTheDocument();
    finish({}); await waitFor(() => expect(screen.getByText('Request approved.')).toBeInTheDocument());
  });
  it('allows removal of an unavailable follower without inventing approval eligibility', async () => {
    mock.rows = [{ ...row, status: 'active', canApprove: false, follower: { id: 'bob', username: '', displayName: null } }]; mock.save.mockResolvedValue({}); open();
    expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Remove account' }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith({ action: 'remove', relationshipId: row.relationshipId, revision: 7 }));
  });
  it('shows failures with retry and continues empty filtered pages', () => {
    mock.error = true; open(); expect(screen.queryByText(/No pending requests/)).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry followers' })); expect(mock.refetch).toHaveBeenCalled();
    cleanup(); mock.error = false; mock.rows = []; mock.next = true; open(); fireEvent.click(screen.getByRole('button', { name: 'Load more' })); expect(mock.more).toHaveBeenCalled();
  });
  it('does not show a late decision after the dialog closes', async () => {
    let finish!: (value: unknown) => void; mock.save.mockReturnValue(new Promise(resolve => { finish = resolve; })); open();
    fireEvent.click(screen.getByRole('button', { name: 'Decline bob' })); fireEvent.click(screen.getByRole('button', { name: 'Close followers' }));
    finish({}); await waitFor(() => expect(mock.guard).toHaveBeenCalledTimes(3)); expect(screen.queryByText('Request declined.')).not.toBeInTheDocument();
  });
});
