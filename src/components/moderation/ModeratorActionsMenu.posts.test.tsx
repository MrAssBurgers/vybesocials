import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'moderator', epoch: 1, manage: vi.fn(), complete: vi.fn(), raw: vi.fn(), success: vi.fn(), error: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: `profile-${state.uid}` } }) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { ready: true, session: { uid, epoch }, profile: { id: `profile-${uid}` }, guard: () => {
    if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed');
  } };
} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@/lib/postMutationService', () => ({ managePost: (...args: unknown[]) => state.manage(...args),
  postMutationAttempt: async () => ({ requestId: 'stable-delete-attempt', complete: state.complete }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.raw } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/hooks/useModeration', () => ({ useUserRole: () => ({ data: 'moderator' }) }));
vi.mock('@/hooks/useModerationActions', () => ({ useWarnUser: () => ({}), useBanUser: () => ({}) }));
vi.mock('./GiphySearchPicker', () => ({ GiphySearchPicker: () => null }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ open, children }: any) => open ? children : null,
  DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogFooter: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p> }));
vi.mock('@/components/ui/dropdown-menu', () => ({ DropdownMenuItem: ({ children, ...props }: any) => <button {...props}>{children}</button>, DropdownMenuSeparator: () => null }));
import { ModeratorDialogs, ModeratorMenuItems } from './ModeratorActionsMenu';
const read = { action: 'read', status: 'published', revision: 'a'.repeat(48), post: { authorId: 'profile-author' }, needsOwnerConfirmation: false };
const deleted = { action: 'delete', status: 'deleted', revision: null, post: null };
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const props = { username: 'author', userId: 'profile-author', warnDialogOpen: false, setWarnDialogOpen: vi.fn(), banDialogOpen: false,
  setBanDialogOpen: vi.fn(), memeBanDialogOpen: false, setMemeBanDialogOpen: vi.fn(),
  deleteContentDialog: { type: 'post' as const, id: 'one' }, setDeleteContentDialog: vi.fn(), onPostDelete: vi.fn() };
beforeEach(() => {
  state.uid = 'moderator'; state.epoch = 1; vi.clearAllMocks();
  state.manage.mockReset();
  state.manage.mockImplementation(async (_actor, request) => request.action === 'read' ? read : deleted);
});
afterEach(cleanup);
describe('moderator checked post removal', () => {
  it('opens confirmation without optimistically deleting, notifying or claiming success', () => {
    const confirm = vi.fn(), remove = vi.fn();
    render(<ModeratorMenuItems userId="author" username="author" postId="one" onPostDelete={remove} onWarnClick={() => {}} onBanClick={() => {}} onMemeBanClick={() => {}} onDeleteContentClick={confirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Post (Mod)' }));
    expect(confirm).toHaveBeenCalledWith('post', 'one'); expect(remove).not.toHaveBeenCalled();
    expect(state.raw).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(state.manage).not.toHaveBeenCalled();
  });
  it('captures a current staff-readable revision before confirmation and removes only after the checked receipt', async () => {
    const checked = deferred(), saved = deferred(); state.manage.mockImplementation((_actor, request) => request.action === 'read' ? checked.promise : saved.promise);
    render(<ModeratorDialogs {...props} />);
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeDisabled();
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(1));
    expect(state.manage.mock.calls[0][3]).toEqual({ allowStaffRead: true });
    await act(async () => checked.resolve(read)); fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(2));
    expect(state.manage.mock.calls[1][1]).toEqual({ action: 'delete', postId: 'one', expectedRevision: 'a'.repeat(48), requestId: 'stable-delete-attempt' });
    expect(props.onPostDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    await act(async () => saved.resolve(deleted));
    expect(props.onPostDelete).toHaveBeenCalledTimes(1); expect(props.setDeleteContentDialog).toHaveBeenCalledWith(null);
    expect(state.success).toHaveBeenCalledWith('Post deleted'); expect(state.raw).not.toHaveBeenCalled();
  });
  it('shows check errors, disables confirmation and allows an explicit fresh check', async () => {
    state.manage.mockRejectedValueOnce(new Error('Permission unavailable'));
    render(<ModeratorDialogs {...props} />); await screen.findByText('Permission unavailable');
    expect(screen.getByRole('button', { name: 'Delete post' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry post check' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete post' })).not.toBeDisabled());
    expect(state.manage.mock.calls.map(call => call[1].action)).toEqual(['read', 'read']);
  });
  it('retains the same delete attempt after an unconfirmed response and never hides the post prematurely', async () => {
    state.manage.mockResolvedValueOnce(read).mockRejectedValueOnce(new Error('Deletion response lost'));
    render(<ModeratorDialogs {...props} />); await waitFor(() => expect(screen.getByRole('button', { name: 'Delete post' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); await screen.findByText('Deletion response lost');
    expect(props.onPostDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); await waitFor(() => expect(props.onPostDelete).toHaveBeenCalledTimes(1));
    expect(state.manage.mock.calls.map(call => call[1].action)).toEqual(['read', 'delete', 'delete']);
    expect(state.manage.mock.calls[2][1]).toEqual(state.manage.mock.calls[1][1]);
  });
  it('rejects a non-deleted receipt instead of claiming success', async () => {
    state.manage.mockResolvedValueOnce(read).mockResolvedValueOnce({ ...read, action: 'delete' });
    render(<ModeratorDialogs {...props} />); await waitFor(() => expect(screen.getByRole('button', { name: 'Delete post' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); await screen.findByText('Post removal was not confirmed. Please retry.');
    expect(props.onPostDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
  it('discards a late read after switching posts and a late delete after account ABA', async () => {
    const oldRead = deferred(), currentRead = deferred(); state.manage.mockImplementationOnce(() => oldRead.promise).mockImplementationOnce(() => currentRead.promise);
    const view = render(<ModeratorDialogs {...props} />);
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(1));
    expect(state.manage.mock.calls[0][1]).toMatchObject({ action: 'read', postId: 'one' });
    view.rerender(<ModeratorDialogs {...props} deleteContentDialog={{ type: 'post', id: 'two' }} />);
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(2));
    expect(state.manage.mock.calls[1][1]).toMatchObject({ action: 'read', postId: 'two' });
    await act(async () => oldRead.resolve(read)); expect(screen.getByRole('button', { name: 'Delete post' })).toBeDisabled();
    expect(state.complete).not.toHaveBeenCalled(); expect(props.onPostDelete).not.toHaveBeenCalled();
    await act(async () => currentRead.resolve({ ...read, revision: 'b'.repeat(48) }));
    const held = deferred(); state.manage.mockImplementationOnce(() => held.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(3));
    expect(state.manage.mock.calls[2][1]).toMatchObject({ postId: 'two', expectedRevision: 'b'.repeat(48) });
    state.uid = 'other'; state.epoch++; view.rerender(<ModeratorDialogs {...props} deleteContentDialog={null} />);
    state.uid = 'moderator'; state.epoch++; view.rerender(<ModeratorDialogs {...props} deleteContentDialog={null} />);
    await act(async () => held.resolve(deleted)); expect(props.onPostDelete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    expect(state.complete).not.toHaveBeenCalled(); expect(state.invalidate).not.toHaveBeenCalled();
  });
  it('allows deletion of a checked legacy post without republishing or recovering it', async () => {
    state.manage.mockResolvedValueOnce({ ...read, status: 'legacy', needsOwnerConfirmation: true });
    render(<ModeratorDialogs {...props} />); await waitFor(() => expect(screen.getByRole('button', { name: 'Delete post' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Delete post' })); await waitFor(() => expect(props.onPostDelete).toHaveBeenCalled());
    expect(state.manage.mock.calls.map(call => call[1].action)).toEqual(['read', 'delete']); expect(state.raw).not.toHaveBeenCalled();
  });
});
