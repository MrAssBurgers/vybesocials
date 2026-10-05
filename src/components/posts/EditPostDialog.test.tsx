import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), mutate: vi.fn(), guard: vi.fn(), success: vi.fn(), ready: true }));
vi.mock('@/hooks/usePostMutations', () => ({ usePostMutations: () => ({ ...state, isPending: false }) }));
vi.mock('sonner', () => ({ toast: { success: state.success } }));
import { EditPostDialog } from './EditPostDialog';
const row = { id: 'post', authorId: 'alice', type: 'post', caption: 'Current caption', tags: ['tag'], createdAt: '2026-10-04T00:00:00.000Z', isPinned: false, aiOverride: null, mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public' };
const current = { status: 'published', revision: 'a'.repeat(48), post: row, needsOwnerConfirmation: false };
const close = vi.fn();
const props = { open: true, onOpenChange: close, post: { id: 'post', caption: 'Stale parent', tags: [] } };
beforeEach(() => { vi.clearAllMocks(); state.read.mockResolvedValue(current); state.guard.mockImplementation(() => {}); state.mutate.mockResolvedValue(current); state.ready = true; });
afterEach(cleanup);
it('loads current content before editing and preserves draft after a rejected save', async () => {
  state.mutate.mockRejectedValue(new Error('Post changed elsewhere'));
  render(<EditPostDialog {...props} />);
  expect(screen.getByLabelText('Caption')).toBeDisabled();
  await waitFor(() => expect(screen.getByLabelText('Caption')).toHaveValue('Current caption'));
  fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'My draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Post changed elsewhere'); expect(screen.getByLabelText('Caption')).toHaveValue('My draft'); expect(close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  expect(state.mutate).toHaveBeenCalledWith({ action: 'update', postId: 'post', expectedRevision: current.revision, payload: { caption: 'My draft', tags: ['tag'] } });
});
it('requires the explicit recovery action for an older unconfirmed post', async () => {
  state.read.mockResolvedValue({ ...current, status: 'legacy', needsOwnerConfirmation: true }); render(<EditPostDialog {...props} />);
  await screen.findByRole('button', { name: 'Save and share' }); expect(state.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save and share' }));
  await waitFor(() => expect(close).toHaveBeenCalledWith(false)); expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'recover', expectedRevision: current.revision, payload: expect.objectContaining({ caption: 'Current caption', visibility: 'public' }) }));
});
it('never closes another account view or announces success from a retired request', async () => {
  let resolve!: (value: unknown) => void; state.mutate.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<EditPostDialog {...props} />); await waitFor(() => expect(screen.getByLabelText('Caption')).toHaveValue('Current caption'));
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' })); state.guard.mockImplementation(() => { throw new Error('Account changed'); });
  await act(async () => { resolve(current); }); expect(close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
});
it('shows a read error instead of editing stale parent content', async () => {
  state.read.mockRejectedValue(new Error('Offline')); render(<EditPostDialog {...props} />);
  await screen.findByText('Offline'); expect(screen.getByLabelText('Caption')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  state.read.mockResolvedValue(current); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await waitFor(() => expect(screen.getByLabelText('Caption')).toHaveValue('Current caption'));
});
