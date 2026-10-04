import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 0, own: null as any, friends: null as any, save: vi.fn(), remove: vi.fn(), invoke: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `${mock.uid}-profile`, user_id: mock.uid, username: mock.uid } }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountSnapshot: () => ({ uid: mock.uid, epoch: mock.epoch }), tokenAccountGuard: (uid: string) => {
  const epoch = mock.epoch; return () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Account changed'); };
} }));
vi.mock('@/hooks/useNotes', () => ({ useMyNote: () => mock.own, useFriendsNotes: () => mock.friends,
  useSetNote: () => ({ mutate: mock.save, isPending: false }), useDeleteNote: () => ({ mutate: mock.remove, isPending: false }) }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: mock.invoke } } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: vi.fn() } }));
import { NotesRow } from './NotesRow';
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = 'alice'; mock.epoch++;
  mock.own = { data: { content: 'Saved note', gif_url: null }, state: { revision: 'a'.repeat(48) }, refetch: vi.fn(), isError: false, isPending: false };
  mock.friends = { data: [], refetch: vi.fn(), isError: false };
  mock.invoke.mockResolvedValue({ data: { results: [] }, error: null });
});
afterEach(cleanup);
it('retains a failed note draft and shows the actual retry message', async () => {
  render(<NotesRow />); fireEvent.click(screen.getByText('My Note'));
  const editor = screen.getByPlaceholderText("Share what's on your mind...");
  fireEvent.change(editor, { target: { value: 'Keep this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(mock.save.mock.calls[0][0]).toMatchObject({ content: 'Keep this draft', expectedRevision: 'a'.repeat(48) });
  act(() => mock.save.mock.calls[0][1].onError(new Error('Your note changed elsewhere')));
  expect(screen.getByRole('alert')).toHaveTextContent('Your note changed elsewhere');
  expect(editor).toHaveValue('Keep this draft'); expect(mock.success).not.toHaveBeenCalled();
});
it('keeps a changed draft open after an older save succeeds and advances its revision', async () => {
  render(<NotesRow />); fireEvent.click(screen.getByText('My Note'));
  const editor = screen.getByPlaceholderText("Share what's on your mind...");
  fireEvent.change(editor, { target: { value: 'First save' } }); fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  fireEvent.change(editor, { target: { value: 'New unsaved text' } });
  act(() => mock.save.mock.calls[0][1].onSuccess({ revision: 'b'.repeat(48) }));
  expect(editor).toHaveValue('New unsaved text'); expect(mock.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(mock.save.mock.calls[1][0]).toMatchObject({ content: 'New unsaved text', expectedRevision: 'b'.repeat(48) });
});
it('reports failed removal without closing the editor or claiming deletion', () => {
  render(<NotesRow />); fireEvent.click(screen.getByText('My Note')); fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  act(() => mock.remove.mock.calls[0][1].onError(new Error('Could not remove note')));
  expect(screen.getByRole('dialog')).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Could not remove note');
  expect(mock.success).not.toHaveBeenCalled();
});
it('shows a read failure and retries both note readers instead of pretending they are empty', () => {
  mock.own = { ...mock.own, data: null, state: undefined, isError: true }; mock.friends.isError = true;
  render(<NotesRow />); expect(screen.getByRole('alert')).toHaveTextContent('could not be refreshed');
  fireEvent.click(screen.getByRole('button', { name: 'Retry notes' }));
  expect(mock.own.refetch).toHaveBeenCalled(); expect(mock.friends.refetch).toHaveBeenCalled();
});
it('closes account-private drafts and suppresses old completion feedback on account changes', () => {
  // The fixture auth hook has no real context subscription, so bypass only the
  // React.memo shell when explicitly simulating that subscription's rerender.
  const Component = (NotesRow as any).type;
  const view = render(<Component />); fireEvent.click(screen.getByText('My Note')); fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  mock.uid = 'other'; mock.epoch++; view.rerender(<Component />);
  act(() => mock.save.mock.calls[0][1].onSuccess({ revision: 'b'.repeat(48) }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(mock.success).not.toHaveBeenCalled();
});
it('exposes GIF transport errors with retry rather than a false empty result', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { message: 'Provider unavailable' } });
  render(<NotesRow />); fireEvent.click(screen.getByText('My Note')); fireEvent.click(screen.getByRole('button', { name: /Add GIF/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry GIFs' })).toBeInTheDocument());
  expect(screen.queryByText('No GIFs found')).not.toBeInTheDocument();
});
it('does not submit when Enter commits an input-method composition', () => {
  render(<NotesRow />); fireEvent.click(screen.getByRole('button', { name: 'Edit your note' }));
  const editor = screen.getByRole('textbox', { name: 'Your note' });
  fireEvent.keyDown(editor, { key: 'Enter', isComposing: true });
  expect(mock.save).not.toHaveBeenCalled();
  fireEvent.keyDown(editor, { key: 'Enter', isComposing: false });
  expect(mock.save).toHaveBeenCalledTimes(1);
});
it('exposes the full friend note to assistive technology despite visual truncation', () => {
  mock.friends.data = [{ id: 'friend-note', content: 'The full note is available even when the bubble is narrow', gif_url: null,
    profile: { id: 'friend-profile', username: 'friend', display_name: 'Friend name', avatar_url: null } }];
  render(<NotesRow />);
  expect(screen.getByRole('button', { name: /View Friend name's profile.*The full note is available even when the bubble is narrow/ })).toBeInTheDocument();
});
