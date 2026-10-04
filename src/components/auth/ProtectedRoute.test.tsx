import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';

const state = vi.hoisted(() => ({
  auth: { user: null as null | { id: string }, profile: null as null | { onboarding_completed: boolean }, authReady: true },
  stored: false, approval: false, stash: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => state.stored }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => state.approval }));
vi.mock('@/lib/authReturnPath', () => ({ stashAuthReturnPath: state.stash }));

beforeEach(() => {
  state.auth = { user: null, profile: null, authReady: true };
  state.stored = false; state.approval = false; state.stash.mockClear();
});
afterEach(cleanup);
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
    state.auth = { user: { id: 'test-user' }, profile: { onboarding_completed: true }, authReady: true }; show();
    expect(screen.getByText('Protected feature mounted')).toBeInTheDocument();
  });
  it('preserves existing cached-session restoration', () => {
    state.stored = true; state.auth.authReady = false; show();
    expect(screen.getByText('Protected feature mounted')).toBeInTheDocument();
  });
  it('does not bypass pending login approval', () => {
    state.approval = true; show('/connect/game?code=ABCD-2345');
    expect(screen.getByText('Authentication destination')).toBeInTheDocument();
    expect(state.stash).toHaveBeenCalledWith('/connect/game?code=ABCD-2345');
  });
  it.each([null, { onboarding_completed: false }])('preserves a game consent destination through profile restoration/onboarding: %j', profile => {
    state.auth = { user: { id: 'test-user' }, profile, authReady: true };
    show('/connect/game?code=ABCD-2345#request');
    expect(screen.getByText('Onboarding destination')).toBeInTheDocument();
    expect(state.stash).toHaveBeenCalledWith('/connect/game?code=ABCD-2345#request');
  });
  it('does not bypass onboarding', () => {
    state.auth = { user: { id: 'test-user' }, profile: { onboarding_completed: false }, authReady: true }; show();
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
});
