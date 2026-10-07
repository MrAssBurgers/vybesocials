import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ auth: { user: null as null | { id: string }, loading: false, authReady: false }, approval: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => true }));
vi.mock('@/lib/deviceDetection', () => ({ isMobileOrTabletDevice: () => true }));
vi.mock('@/lib/mobileIntroVersion', () => ({ hasCompletedCurrentIntro: () => true }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => state.approval }));
vi.mock('@/pages/Landing', () => ({ default: () => <p>Sign-in form</p> }));
vi.mock('@/pages/VybeHome', () => ({ default: () => <p>Marketing</p> }));
vi.mock('@/pages/MobileIntro', () => ({ default: () => <p>Intro</p> }));
import RootGate from './RootGate';
const content = () => <MemoryRouter><Routes><Route path="/" element={<RootGate />} /><Route path="/home" element={<p>Signed-in home</p>} /></Routes></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.auth = { user: null, loading: false, authReady: false }; state.approval = false; });
afterEach(() => { cleanup(); localStorage.clear(); });
describe('native root restoration', () => {
  it('shows the sign-in form immediately when nothing is saved', async () => {
    render(content());
    expect(await screen.findByText('Sign-in form')).toBeInTheDocument();
    expect(screen.queryByText(/Restoring your account/)).not.toBeInTheDocument();
    expect(screen.queryByText('Signed-in home')).not.toBeInTheDocument();
  });
  it('keeps a saved account on a silent spinner until it can open the app', () => {
    localStorage.setItem('vybe.auth.user', '{}');
    render(content());
    expect(screen.getByText('Loading VYBE…')).toBeInTheDocument();
    expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
    expect(screen.queryByText(/Restoring your account/)).not.toBeInTheDocument();
    expect(screen.queryByText('Signed-in home')).not.toBeInTheDocument();
  });
  it('shows sign-in after an empty session settles and preserves the approval gate', async () => {
    state.auth.authReady = true; const view = render(content()); await screen.findByText('Sign-in form');
    state.auth.user = { id: 'alice' }; state.approval = true; view.rerender(content()); expect(screen.getByText('Sign-in form')).toBeInTheDocument(); expect(screen.queryByText('Signed-in home')).not.toBeInTheDocument();
  });
  it('moves a late restored account to Home without an intervening sign-in form', async () => {
    localStorage.setItem('vybe.auth.user', '{}');
    const view = render(content());
    expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
    state.auth = { user: { id: 'alice' }, loading: false, authReady: true }; view.rerender(content());
    await waitFor(() => expect(screen.getByText('Signed-in home')).toBeInTheDocument());
    expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
  });
});
