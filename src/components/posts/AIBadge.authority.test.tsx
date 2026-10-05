import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, manage: vi.fn(), complete: vi.fn(), success: vi.fn(), error: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: `profile-${state.uid}` } }) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { ready: true, session: { uid, epoch }, profile: { id: `profile-${uid}` }, guard: () => {
    if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed');
  } };
} }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@/lib/postMutationService', () => ({ managePost: (...args: unknown[]) => state.manage(...args),
  postMutationAttempt: async () => ({ requestId: 'stable-attempt', complete: state.complete }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: any) => children, motion: {
  div: ({ initial, animate, exit, transition, ...props }: any) => <div {...props} />,
  button: ({ initial, animate, exit, transition, ...props }: any) => <button {...props} />,
} }));
import { AIBadge } from './AIBadge';
const props = { postId: 'post-one', authorId: 'profile-alice', isAiGenerated: true, aiConfidence: 0.9, aiOverride: null };
const receipt = (action = 'read', aiOverride: boolean | null = null) => ({ action, status: 'published', revision: 'a'.repeat(48), post: { aiOverride }, needsOwnerConfirmation: false });
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => {
  state.uid = 'alice'; state.epoch = 1; vi.clearAllMocks();
  state.manage.mockReset();
  state.manage.mockImplementation(async (_actor, request) => receipt(request.action, request.payload?.aiOverride ?? null));
});
afterEach(cleanup);
const open = () => fireEvent.click(screen.getByRole('button', { name: /AI\s*90%/ }));
describe('AI badge checked correction', () => {
  it('reads the current revision and stays pending until the matching mutation is confirmed', async () => {
    const held = deferred(); state.manage.mockImplementation((_actor, request) => request.action === 'read' ? Promise.resolve(receipt()) : held.promise);
    render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI'));
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(2));
    expect(state.manage.mock.calls[1][1]).toMatchObject({ action: 'update', postId: 'post-one', expectedRevision: 'a'.repeat(48), payload: { aiOverride: false } });
    expect(screen.getByTitle('Confirm AI')).toBeDisabled(); expect(state.success).not.toHaveBeenCalled();
    await act(async () => held.resolve(receipt('update', false)));
    expect(state.success).toHaveBeenCalledWith('AI label removed'); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps a failed attempt and revision for a checked retry without changing the badge', async () => {
    state.manage.mockImplementationOnce(async () => receipt()).mockRejectedValueOnce(new Error('Connection lost after save'));
    render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI'));
    await screen.findByText('Connection lost after save'); expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Not AI'));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith('AI label removed'));
    expect(state.manage.mock.calls.map(call => call[1].action)).toEqual(['read', 'update', 'update']);
    expect(state.manage.mock.calls[2][1]).toEqual(state.manage.mock.calls[1][1]);
  });
  it('rejects a nonmatching receipt and explains legacy recovery instead of raw writing', async () => {
    state.manage.mockImplementationOnce(async () => receipt()).mockResolvedValueOnce(receipt('update', true));
    const view = render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI'));
    await screen.findByText('The AI label change was not confirmed. Please retry.'); expect(state.success).not.toHaveBeenCalled();
    view.rerender(<AIBadge {...props} postId="older" />);
    state.manage.mockResolvedValueOnce({ ...receipt(), status: 'legacy', needsOwnerConfirmation: true });
    open(); fireEvent.click(screen.getByTitle('Not AI'));
    await screen.findByText('Review and share this older post before changing its AI label.');
    expect(state.manage).toHaveBeenCalledTimes(3);
  });
  it('uses fresh prop values and does not carry a previous post override into a new post', async () => {
    const view = render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI'));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    view.rerender(<AIBadge {...props} aiOverride={true} />); expect(screen.getByRole('button', { name: /AI\s*90%/ })).toBeDefined();
    view.rerender(<AIBadge {...props} aiOverride={null} />); expect(screen.getByRole('button', { name: /AI\s*90%/ })).toBeDefined();
    view.rerender(<AIBadge {...props} postId="post-two" aiOverride={null} />); expect(screen.getByRole('button', { name: /AI\s*90%/ })).toBeDefined();
  });
  it('ignores late reads after a post switch and retired account attempts including A → B → A', async () => {
    const read = deferred(); state.manage.mockImplementationOnce(() => read.promise);
    const view = render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI'));
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(1));
    expect(state.manage.mock.calls[0][1]).toMatchObject({ action: 'read', postId: 'post-one' });
    view.rerender(<AIBadge {...props} postId="post-two" />); await act(async () => read.resolve(receipt()));
    expect(state.manage).toHaveBeenCalledTimes(1); expect(state.complete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
    const update = deferred(); state.manage.mockImplementation((_actor, request) => request.action === 'read' ? Promise.resolve(receipt()) : update.promise);
    open(); fireEvent.click(screen.getByTitle('Not AI')); await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(3));
    state.uid = 'bob'; state.epoch++; view.rerender(<AIBadge {...props} postId="post-two" />);
    state.uid = 'alice'; state.epoch++; view.rerender(<AIBadge {...props} postId="post-two" />);
    await act(async () => update.resolve(receipt('update', false)));
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); expect(screen.queryByRole('alert')).toBeNull();
  });
  it('does not send duplicate changes while the authoritative read is pending', async () => {
    const held = deferred(); state.manage.mockImplementationOnce(() => held.promise);
    render(<AIBadge {...props} />); open(); fireEvent.click(screen.getByTitle('Not AI')); fireEvent.click(screen.getByTitle('Confirm AI'));
    expect(screen.getByTitle('Not AI')).toBeDisabled(); expect(screen.getByTitle('Confirm AI')).toBeDisabled();
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(1));
    expect(state.manage.mock.calls[0][1]).toMatchObject({ action: 'read' });
    expect(state.complete).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    await act(async () => held.resolve(receipt()));
    await waitFor(() => expect(state.manage).toHaveBeenCalledTimes(2));
    expect(state.manage.mock.calls[1][1]).toMatchObject({ action: 'update', payload: { aiOverride: false } });
  });
});
