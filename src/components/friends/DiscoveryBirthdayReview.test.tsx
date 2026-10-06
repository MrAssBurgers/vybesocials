import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, save: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: true, user: { id: uid }, profile: { id: `profile-${uid}` }, session: { epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw Error('Account changed'); } };
} }));
vi.mock('@/lib/profilePrivate', () => ({ savePrivateProfileDateOfBirth: state.save }));
import DiscoveryBirthdayReview from './DiscoveryBirthdayReview';
import { DiscoveryReadStatus } from './DiscoveryReadStatus';
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.save.mockReset().mockImplementation(async (_value, guard) => guard()); });
afterEach(cleanup);
it('shows a retryable failure instead of a successful empty list', () => {
  const retry = vi.fn(); render(<DiscoveryReadStatus error={Error('Unavailable')} retry={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Suggestions couldn’t load');
  fireEvent.click(screen.getByRole('button', { name: 'Retry suggestions' })); expect(retry).toHaveBeenCalledOnce();
});
it('saves only the selected birthday to the checked current private profile', async () => {
  const saved = vi.fn(); render(<DiscoveryBirthdayReview onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByRole('dialog')).toHaveTextContent('It stays private');
  fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2001-05-03' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save birthday' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(state.save).toHaveBeenCalledWith({ authUid: 'alice', profileId: 'profile-alice', dateOfBirth: '2001-05-03' }, expect.any(Function));
});
it('retains a failed save for retry without pretending the birthday was confirmed', async () => {
  state.save.mockRejectedValueOnce(Error('Offline')); const saved = vi.fn();
  render(<DiscoveryBirthdayReview onClose={vi.fn()} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2001-05-03' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save birthday' }));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Offline')); expect(saved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save birthday' })); await waitFor(() => expect(saved).toHaveBeenCalledOnce());
});
it('retires a delayed save acknowledgment when the review closes', async () => {
  let resolve!: () => void;
  state.save.mockImplementation(async (_value, guard) => { await new Promise<void>(done => { resolve = done; }); guard(); });
  const saved = vi.fn(), close = vi.fn(); render(<DiscoveryBirthdayReview onClose={close} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2001-05-03' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save birthday' })); await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => resolve()); expect(close).toHaveBeenCalledOnce(); expect(saved).not.toHaveBeenCalled();
});
it('closes and retires the entered birthday when the account changes', () => {
  const close = vi.fn(), saved = vi.fn(); const view = render(<DiscoveryBirthdayReview onClose={close} onSaved={saved} />);
  fireEvent.change(screen.getByLabelText('Birthday'), { target: { value: '2001-05-03' } });
  state.uid = 'bob'; state.epoch++; view.rerender(<DiscoveryBirthdayReview onClose={close} onSaved={saved} />);
  expect(close).toHaveBeenCalledOnce(); fireEvent.click(screen.getByRole('button', { name: 'Save birthday' }));
  expect(state.save).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
});
