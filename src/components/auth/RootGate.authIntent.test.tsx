import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: null, loading: false, authReady: true }) }));
vi.mock('@/lib/despiaBridge', () => ({ isNativeAppShell: () => false }));
vi.mock('@/lib/deviceDetection', () => ({ isMobileOrTabletDevice: () => false }));
vi.mock('@/lib/mobileIntroVersion', () => ({ hasCompletedCurrentIntro: () => false }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => false }));
vi.mock('@/pages/Landing', () => ({ default: () => <p>Sign-in form</p> }));
vi.mock('@/pages/VybeHome', () => ({ default: () => <p>Marketing</p> }));
vi.mock('@/pages/MobileIntro', () => ({ default: () => <p>Intro</p> }));

import RootGate from './RootGate';

function view(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<RootGate />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('desktop auth entry links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a plain visit on the marketing page', async () => {
    view('/');
    expect(await screen.findByText('Marketing')).toBeInTheDocument();
    expect(screen.queryByText('Sign-in form')).not.toBeInTheDocument();
  });

  it('opens signup and login from the query links the marketing site used to publish', async () => {
    const signup = view('/?signup=true');
    expect(await screen.findByText('Sign-in form')).toBeInTheDocument();
    signup.unmount();
    view('/?mode=login');
    expect(await screen.findByText('Sign-in form')).toBeInTheDocument();
    expect(screen.queryByText('Intro')).not.toBeInTheDocument();
  });
});
