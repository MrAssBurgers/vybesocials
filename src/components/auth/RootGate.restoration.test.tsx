import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ auth: { user: null as null | { id: string }, loading: false, authReady: false }, retry: vi.fn(), abandon: vi.fn(), phase: 'pending', approval: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/firebase/authService', () => ({ retryAuthRestore: state.retry, abandonAuthRestore: state.abandon, getAuthRestoreState: () => state.phase, subscribeAuthRestoreState: () => () => {} }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => true }));
vi.mock('@/lib/deviceDetection', () => ({ isMobileOrTabletDevice: () => true }));
vi.mock('@/lib/mobileIntroVersion', () => ({ hasCompletedCurrentIntro: () => true }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => state.approval }));
vi.mock('@/pages/Landing', () => ({ default: () => <p>Sign-in form</p> }));
vi.mock('@/pages/VybeHome', () => ({ default: () => <p>Marketing</p> }));
vi.mock('@/pages/MobileIntro', () => ({ default: () => <p>Intro</p> }));
import RootGate from './RootGate';
const content = () => <MemoryRouter><Routes><Route path="/" element={<RootGate />} /><Route path="/home" element={<p>Signed-in home</p>} /></Routes></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); state.auth = { user: null, loading: false, authReady: false }; state.approval = false; state.phase = 'pending'; state.retry.mockResolvedValue(undefined); state.abandon.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('native root restoration', () => {
  it('shows bounded recovery controls after splash timeout without rendering sign-in or private content', async () => {
    vi.useFakeTimers(); render(content()); expect(screen.getByRole('status', { name: 'Restoring your account' })).toBeInTheDocument(); expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_001); }); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await act(async () => {}); expect(state.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText('Signed-in home')).not.toBeInTheDocument();
  });
  it('blocks duplicate retries and keeps the saved-account recovery surface on failure', async () => {
    vi.useFakeTimers(); let reject!: (reason: unknown) => void; state.retry.mockReturnValue(new Promise((_r, j) => { reject = j; })); render(content());
    await act(async () => { await vi.advanceTimersByTimeAsync(8_001); }); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); fireEvent.click(screen.getByRole('button', { name: 'Trying again…' })); expect(state.retry).toHaveBeenCalledOnce();
    await act(async () => reject(new Error('Native unavailable'))); expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled(); expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
  });
  it('shows sign-in only after authoritative empty restoration and preserves the approval gate', async () => {
    state.auth.authReady = true; const view = render(content()); await screen.findByText('Sign-in form');
    state.auth.user = { id: 'alice' }; state.approval = true; view.rerender(content()); expect(screen.getByText('Sign-in form')).toBeInTheDocument(); expect(screen.queryByText('Signed-in home')).not.toBeInTheDocument();
  });
  it('offers deliberate sign-in fallback only after unknown restoration fails', async () => {
    state.phase = 'error'; render(content()); expect(state.abandon).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' })); await act(async () => {});
    expect(state.abandon).toHaveBeenCalledOnce(); expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
  });
  it('moves a late restored account to Home without an intervening sign-in form', async () => {
    const view = render(content()); state.auth = { user: { id: 'alice' }, loading: false, authReady: true }; view.rerender(content()); await waitFor(() => expect(screen.getByText('Signed-in home')).toBeInTheDocument()); expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
  });
});
