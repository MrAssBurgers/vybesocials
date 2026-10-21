import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ native: false, intro: false, auth: { user: null as null | { id: string }, loading: false, authReady: true } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => state.native }));
// A phone browser is deliberately mobile without being the installed app.
vi.mock('@/lib/deviceDetection', () => ({ isMobileOrTabletDevice: () => true }));
vi.mock('@/lib/mobileIntroVersion', () => ({ hasCompletedCurrentIntro: () => state.intro }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => false }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => false }));
vi.mock('@/pages/Landing', () => ({ default: () => <p>Account sign in</p> }));
vi.mock('@/pages/VybeHome', () => ({ default: () => <p>Public VYBE website</p> }));
vi.mock('@/pages/MobileIntro', () => ({ default: () => <p>Native introduction</p> }));
import RootGate from './RootGate';
import { PublicOnlyRoute } from './PublicOnlyRoute';

function view(path = '/') {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<RootGate />} />
    <Route path="/tour" element={<PublicOnlyRoute><p>Public product tour</p></PublicOnlyRoute>} />
    <Route path="/auth" element={<p>Native auth route</p>} />
    <Route path="/home" element={<p>Member Home</p>} />
  </Routes></MemoryRouter>);
}
beforeEach(() => { state.native = false; state.intro = false; state.auth = { user: null, loading: false, authReady: true }; });
afterEach(cleanup);

describe('public website access on mobile browsers', () => {
  it('shows the genuine website rather than introduction or auth on a first visit', async () => {
    view();
    expect(await screen.findByText('Public VYBE website')).toBeInTheDocument();
    expect(screen.queryByText('Native introduction')).not.toBeInTheDocument();
    expect(screen.queryByText('Account sign in')).not.toBeInTheDocument();
  });
  it('keeps the public tour available without waiting for account initialization', () => {
    state.auth.loading = true; state.auth.authReady = false; view('/tour');
    expect(screen.getByText('Public product tour')).toBeInTheDocument();
    expect(screen.queryByText('Native auth route')).not.toBeInTheDocument();
  });
  it('honors an explicit signup link on a phone browser', async () => {
    view('/?signup=true'); expect(await screen.findByText('Account sign in')).toBeInTheDocument();
    expect(screen.queryByText('Public VYBE website')).not.toBeInTheDocument();
  });
  it('keeps native first launch and returning account entry unchanged', async () => {
    state.native = true; const first = view(); expect(await screen.findByText('Native introduction')).toBeInTheDocument(); first.unmount();
    state.intro = true; view(); expect(await screen.findByText('Account sign in')).toBeInTheDocument();
  });
  it('keeps the native tour route in the app account flow', async () => {
    state.native = true; view('/tour'); expect(await screen.findByText('Native auth route')).toBeInTheDocument();
    expect(screen.queryByText('Public product tour')).not.toBeInTheDocument();
  });
  it('keeps signed-in members on Home', async () => {
    state.auth.user = { id: 'member' }; view(); expect(await screen.findByText('Member Home')).toBeInTheDocument();
  });
});
