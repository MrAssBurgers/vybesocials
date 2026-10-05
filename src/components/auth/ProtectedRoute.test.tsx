import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const state = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, profile: null as null | { id: string; user_id: string; onboarding_completed: boolean }, authReady: true,
    profileSetupError: null as null | { message: string; recoveryAvailable: boolean }, profileSetupLoading: false },
  retry: vi.fn(), recover: vi.fn(), signOut: vi.fn(),
  stored: false, approval: false, stash: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ ...state.auth, retryProfileSetup: state.retry, recoverProfileSetup: state.recover, signOut: state.signOut }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.auth.user?.id, epoch: 1 }) }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra?: () => void) => () => { extra?.(); if (uid !== state.auth.user?.id) throw new Error('Changed'); } }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => state.stored }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => state.approval }));
vi.mock('@/lib/authReturnPath', () => ({ stashAuthReturnPath: state.stash }));

beforeEach(() => {
  state.auth = { user: null, profile: null, authReady: true, profileSetupError: null, profileSetupLoading: false };
  state.retry.mockReset(); state.recover.mockReset(); state.signOut.mockReset();
  state.stored = false; state.approval = false; state.stash.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function show(path = '/explore?q=music#results', allowGuest?: boolean) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<p>Login destination</p>} />
    <Route path="/auth" element={<p>Authentication destination</p>} />
    <Route path="/onboarding" element={<p>Onboarding destination</p>} />
    <Route path="*" element={<ProtectedRoute allowGuest={allowGuest}><p>Protected feature mounted</p></ProtectedRoute>} />
  </Routes></MemoryRouter>);
}

describe('database-backed route access', () => {
  it.each(['/home', '/explore', '/clips', '/clips/post-1', '/u/alex', '/p/post-1'])('does not mount protected data hooks for guest %s', path => {
    show(path);
    expect(screen.getByRole('heading', { name: 'Sign in to browse VYBE' })).toBeInTheDocument();
    expect(screen.queryByText('Protected feature mounted')).not.toBeInTheDocument();
  });
  it('preserves the requested route, filters, and anchor on sign-in', () => {
    show();
    fireEvent.click(screen.getByRole('link', { name: 'Sign in', exact: true }));
    expect(state.stash).toHaveBeenCalledWith('/explore?q=music#results');
    expect(screen.getByText('Login destination')).toBeInTheDocument();
  });
  it('shows a named loading state while restoring auth instead of firing guest queries', () => {
    state.auth.authReady = false; show();
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('Protected feature mounted')).not.toBeInTheDocument();
  });
  it('keeps authenticated screens accessible', () => {
    state.auth.user = { id: 'test-user' }; state.auth.profile = { id: 'profile-1', user_id: 'test-user', onboarding_completed: true }; show();
    expect(screen.getByText('Protected feature mounted')).toBeInTheDocument();
  });
  it('uses a stored session only to wait, without mounting private content', () => {
    state.stored = true; state.auth.authReady = false; show();
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument();
    expect(screen.queryByText('Protected feature mounted')).not.toBeInTheDocument();
  });
  it('does not bypass pending login approval', () => {
    state.approval = true; show('/connect/game?code=ABCD-2345');
    expect(screen.getByText('Authentication destination')).toBeInTheDocument();
    expect(state.stash).toHaveBeenCalledWith('/connect/game?code=ABCD-2345');
  });
  it('preserves a game consent destination through onboarding', () => {
    state.auth.user = { id: 'test-user' }; state.auth.profile = { id: 'profile-1', user_id: 'test-user', onboarding_completed: false };
    show('/connect/game?code=ABCD-2345#request');
    expect(screen.getByText('Onboarding destination')).toBeInTheDocument();
    expect(state.stash).toHaveBeenCalledWith('/connect/game?code=ABCD-2345#request');
  });
  it('does not bypass onboarding', () => {
    state.auth.user = { id: 'test-user' }; state.auth.profile = { id: 'profile-1', user_id: 'test-user', onboarding_completed: false }; show();
    expect(screen.getByText('Onboarding destination')).toBeInTheDocument();
  });
  it('does not classify prefix lookalikes as guest routes', () => {
    show('/home-settings');
    expect(screen.getByText('Authentication destination')).toBeInTheDocument();
  });
  it('allows explicitly public components', () => {
    show('/public-help', true);
    expect(screen.getByText('Protected feature mounted')).toBeInTheDocument();
  });
  it('waits for a missing profile without treating it as unfinished onboarding', async () => {
    state.auth.user = { id: 'test-user' }; state.auth.profileSetupLoading = true; show();
    expect(await screen.findByRole('status', { name: 'Loading your profile' })).toBeInTheDocument();
    expect(screen.queryByText('Onboarding destination')).not.toBeInTheDocument();
    expect(screen.queryByText('Protected feature mounted')).not.toBeInTheDocument();
  });
  it('rejects a cached profile belonging to another account', async () => {
    state.auth.user = { id: 'test-user' }; state.auth.profile = { id: 'profile-2', user_id: 'other-user', onboarding_completed: true }; show();
    expect(await screen.findByRole('status', { name: 'Loading your profile' })).toBeInTheDocument();
    expect(screen.queryByText('Protected feature mounted')).not.toBeInTheDocument();
  });
  it('offers explicit retry and approved recovery without starting recovery automatically', async () => {
    state.auth.user = { id: 'test-user' };
    state.auth.profileSetupError = { message: 'Your profile needs recovery.', recoveryAvailable: true }; show();
    expect(await screen.findByRole('alert', { name: 'Profile setup needs attention' })).toBeInTheDocument();
    expect(state.recover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recover my profile' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Recover my profile' }));
    expect(state.retry).toHaveBeenCalledOnce(); expect(state.recover).toHaveBeenCalledOnce();
  });
  it('does not offer unapproved recovery', async () => {
    state.auth.user = { id: 'test-user' };
    state.auth.profileSetupError = { message: 'Please try again.', recoveryAvailable: false }; show();
    await screen.findByRole('alert', { name: 'Profile setup needs attention' });
    expect(screen.queryByRole('button', { name: 'Recover my profile' })).not.toBeInTheDocument();
  });
  it('offers restoration recovery after a bounded wait without erasing a native session', () => {
    vi.useFakeTimers(); state.stored = true; show('/messages?chat=friend');
    expect(screen.queryByRole('link', { name: 'Go to sign in' })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole('button', { name: 'Try loading again' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Go to sign in' }));
    expect(state.stash).toHaveBeenCalledWith('/messages?chat=friend');
    expect(state.signOut).not.toHaveBeenCalled();
  });
});
