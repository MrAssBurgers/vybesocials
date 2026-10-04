import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), invalidate: vi.fn(), request: vi.fn(), clear: vi.fn(), epoch: 1 }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: true, user: { id: 'alice' }, profile: { id: 'profile-alice' }, session: { uid: 'alice', epoch: state.epoch }, guard: () => {} }) }));
vi.mock('@/hooks/useApproximateLocation', () => ({ useApproximateLocation: () => ({ location: { lat: 0, lng: 0 }, pending: false, error: null, requestLocation: state.request, clearLocation: state.clear }) }));
vi.mock('@/lib/postLocalAreaService', () => ({ managePostLocalArea: (...args: unknown[]) => state.invoke(...args) }));
import { PostLocalAreaDialog } from './PostLocalAreaDialog';
const receipt = { ownerUid: 'alice', profileId: 'profile-alice', postId: 'one', action: 'state', revision: 0, enabled: false };
beforeEach(() => { state.epoch = 1; state.invoke.mockReset(); state.invalidate.mockReset(); state.request.mockReset(); state.clear.mockReset(); state.invoke.mockResolvedValue({ ...receipt }); });
afterEach(cleanup);
describe('post Local sharing consent', () => {
  it('requires an explicit share click and acknowledges sharing only after success', async () => {
    render(<PostLocalAreaDialog postId="one" onClose={() => {}} />);
    await screen.findByText('This post is not shared to Local.');
    expect(state.request).not.toHaveBeenCalled(); expect(state.invoke).toHaveBeenCalledTimes(1);
    let finish!: (value: unknown) => void;
    state.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Share this post to Local' }));
    expect(screen.queryByText('This post is shared to Local.')).toBeNull();
    finish({ ...receipt, action: 'share', revision: 1, enabled: true });
    await screen.findByText('This post is shared to Local.');
    expect(state.invoke.mock.calls[1][0]).toMatchObject({ action: 'share', revision: 0, area: { lat: 0, lng: 0 } });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['social-feed'] });
    state.invoke.mockResolvedValueOnce({ ...receipt, action: 'remove', revision: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Local' }));
    await screen.findByText('This post is not shared to Local.');
    expect(state.invoke.mock.calls[2][0]).toMatchObject({ action: 'remove', revision: 1 });
    expect(state.invoke.mock.calls[2][0]).not.toHaveProperty('area');
  });
  it('failed status never offers a share or removal based on a guessed state', async () => {
    state.invoke.mockRejectedValueOnce(new Error('Unavailable'));
    render(<PostLocalAreaDialog postId="one" onClose={() => {}} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: 'Share this post to Local' })).toBeNull();
  });
  it('discards a late receipt after changing posts', async () => {
    let finish!: (value: unknown) => void;
    state.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<PostLocalAreaDialog postId="one" onClose={() => {}} />);
    state.invoke.mockImplementation(() => new Promise(() => {}));
    view.rerender(<PostLocalAreaDialog postId="two" onClose={() => {}} />);
    finish({ ...receipt, enabled: true, revision: 1 });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('This post is shared to Local.')).toBeNull();
    expect(screen.getByText('Checking Local sharing…')).toBeDefined();
  });
});
