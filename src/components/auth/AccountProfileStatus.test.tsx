import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProfileSetupError } from '@/lib/profileAccountGuard';
const state = vi.hoisted(() => ({
  session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, error: null as ProfileSetupError | null,
  loading: false, retry: vi.fn(), recover: vi.fn(), signOut: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profileSetupError: state.error, profileSetupLoading: state.loading, retryProfileSetup: state.retry, recoverProfileSetup: state.recover, signOut: state.signOut }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
import AccountProfileStatus from './AccountProfileStatus';
import { profileSetupFailure } from '@/lib/profileAccountGuard';
function deferred() { let resolve!: () => void, reject!: (error: Error) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.error = profileSetupFailure({ name: 'not-found' }); state.loading = false; });
afterEach(cleanup);

it('explains a missing service without implying unfinished signup or forcing another sign-in', async () => {
  const pending = deferred(); state.retry.mockReturnValue(pending.promise); const view = render(<AccountProfileStatus />);
  expect(screen.getByRole('heading', { name: 'Profile loading is unavailable' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('You’re still signed in');
  expect(screen.queryByText(/Check your connection|Let’s get your profile ready|saved/i)).not.toBeInTheDocument();
  expect(state.retry).not.toHaveBeenCalled(); expect(state.signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' })); fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(state.retry).toHaveBeenCalledOnce(); expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  await act(async () => pending.resolve()); state.error = null; state.loading = true; view.rerender(<AccountProfileStatus />);
  expect(screen.getByRole('status', { name: 'Loading your profile' })).toBeInTheDocument();
  expect(state.user.id).toBe('alice'); expect(state.signOut).not.toHaveBeenCalled();
});

it('keeps sign-in and ownership failures distinct and only offers explicitly approved recovery', () => {
  state.error = profileSetupFailure({ name: 'unauthenticated' }); const view = render(<AccountProfileStatus />);
  expect(screen.getByRole('heading', { name: 'Please check your sign-in' })).toBeInTheDocument();
  expect(state.signOut).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Recover my profile' })).not.toBeInTheDocument();
  state.error = profileSetupFailure({ details: { reason: 'profile-recovery-required', recoveryAvailable: true } }); view.rerender(<AccountProfileStatus />);
  expect(screen.getByRole('heading', { name: 'Confirm your profile' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recover my profile' })).toBeEnabled(); expect(state.recover).not.toHaveBeenCalled();
});

it('does not attach a late retry failure to a replacement account or the same account after ABA', async () => {
  const pending = deferred(); state.retry.mockReturnValue(pending.promise); const view = render(<AccountProfileStatus />);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' }; view.rerender(<AccountProfileStatus />);
  state.session = { uid: 'alice', epoch: 3 }; state.user = { id: 'alice' }; view.rerender(<AccountProfileStatus />);
  await act(async () => pending.reject(Error('Late old retry')));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled());
  expect(screen.queryByText('That did not finish. Please try again.')).not.toBeInTheDocument(); expect(state.signOut).not.toHaveBeenCalled();
});
