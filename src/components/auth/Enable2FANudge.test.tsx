import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn(), navigate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, authReady: true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mock.navigate }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/securitySettingsService', () => ({ readSignInPreferences: mock.read }));
vi.mock('@/lib/crashReportConsent', () => ({ getConsentState: () => true }));
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ open, children }: any) => open ? <div>{children}</div> : null, SheetContent: ({ children }: any) => <div>{children}</div>, SheetHeader: ({ children }: any) => <div>{children}</div>, SheetTitle: ({ children }: any) => <h2>{children}</h2>, SheetDescription: ({ children }: any) => <p>{children}</p> }));
import { Enable2FANudge } from './Enable2FANudge';
const value = (available = false, enabled = false) => ({ settings: { email_2fa_enabled: enabled, login_approvals_enabled: false }, capabilities: { enableEmailConfirmation: available, enableLoginApprovals: false }, revision: 'missing' });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(4000); });
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); localStorage.clear(); mock.uid = 'alice'; mock.epoch++; mock.read.mockResolvedValue(value()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it.each(['unavailable', 'already-enabled', 'read-error'])('does not prompt with %s state', async mode => {
  if (mode === 'read-error') mock.read.mockRejectedValue(new Error('offline')); else mock.read.mockResolvedValue(value(mode === 'already-enabled', mode === 'already-enabled'));
  render(<Enable2FANudge />); await tick(); expect(screen.queryByText('Review sign-in confirmation')).not.toBeInTheDocument(); expect(mock.read).toHaveBeenCalledOnce();
});
it('keeps dismissal local to its account and uses truthful available-preference copy', async () => {
  mock.read.mockResolvedValue(value(true)); const view = render(<Enable2FANudge />); await tick(); fireEvent.click(screen.getByRole('button', { name: 'Remind me later' }));
  expect(localStorage.getItem('vybe-2fa-nudge-dismissed-at:alice')).toBeTruthy(); expect(localStorage.getItem('vybe-2fa-nudge-dismissed-at')).toBeNull();
  mock.uid = 'bob'; mock.epoch++; view.rerender(<Enable2FANudge />); await tick(); expect(screen.getByText('Review the available confirmation options for future sign-ins.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review sign-in confirmation' })); expect(mock.navigate).toHaveBeenCalledWith('/settings?tab=security');
});
it('discards a delayed prompt after the account changes away and back', async () => {
  let resolve!: (data: ReturnType<typeof value>) => void; mock.read.mockReturnValueOnce(new Promise(done => { resolve = done; })); const view = render(<Enable2FANudge />);
  await tick(); mock.epoch += 2; view.rerender(<Enable2FANudge />); await act(async () => resolve(value(true)));
  expect(screen.queryByText('Review sign-in confirmation')).not.toBeInTheDocument();
});
