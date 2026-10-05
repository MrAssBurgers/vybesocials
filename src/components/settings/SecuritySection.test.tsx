import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn(), devices: vi.fn(), history: vi.fn(), update: vi.fn(), revoke: vi.fn(), signOut: vi.fn(), success: vi.fn(), prepare: vi.fn(), checkSignIn: vi.fn(), complete: vi.fn(), retire: vi.fn() }));
vi.mock('@/lib/securitySessionAttempt', () => ({ prepareSecurityRevokeAttempt: mock.prepare, checkSecurityRevokeSignIn: mock.checkSignIn, completeSecurityRevokeAttempt: mock.complete, retireSecurityRevokeAttempt: mock.retire }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, signOut: mock.signOut }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/hooks/useIsOwner', () => ({ useIsOwner: () => ({ isOwner: false }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => { const epoch = mock.epoch; return () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/securitySettingsService', () => ({ readSignInPreferences: mock.read, readSecurityDevices: mock.devices, readSecurityHistory: mock.history, updateSignInPreference: mock.update, revokeAllSecuritySessions: mock.revoke }));
vi.mock('sonner', () => ({ toast: { success: mock.success } }));
vi.mock('./PasskeysCard', () => ({ PasskeysCard: () => null }));
vi.mock('./PhoneNumberCard', () => ({ PhoneNumberCard: () => <p>Phone settings available</p> }));
vi.mock('./ContactSyncCard', () => ({ ContactSyncCard: () => null }));
vi.mock('./QrSignInScannerCard', () => ({ QrSignInScannerCard: () => null }));
vi.mock('./SettingsUI', () => ({ SettingsSectionCard: ({ children, title }: any) => <section><h2>{title}</h2>{children}</section>, SettingsPanel: ({ children }: any) => <div>{children}</div>, SettingsToggleRow: ({ title, checked, disabled, onCheckedChange }: any) => <label>{title}<input type="checkbox" checked={checked} disabled={disabled} onChange={e => onCheckedChange(e.target.checked)} /></label> }));
import { SecuritySection } from './SecuritySection';
const prefs = (email = true) => ({ settings: { email_2fa_enabled: email, login_approvals_enabled: true }, revision: '10:20', capabilities: { enableEmailConfirmation: false, enableLoginApprovals: false } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { resolve, promise }; };
beforeEach(() => { vi.resetAllMocks(); mock.uid = 'alice'; mock.epoch++; mock.read.mockResolvedValue(prefs()); mock.devices.mockResolvedValue({ devices: [], cursor: null }); mock.history.mockResolvedValue([]); mock.update.mockResolvedValue(prefs(false)); mock.revoke.mockResolvedValue({ revokedBefore: new Date().toISOString(), trackedSessionsMarked: 0 }); mock.prepare.mockResolvedValue({ requestId: 'stable-request', authTime: 123 }); });
afterEach(cleanup);
it('shows read errors with retry, without inventing off settings or empty device history', async () => {
  mock.read.mockRejectedValueOnce(new Error('Preferences unavailable')); mock.devices.mockRejectedValueOnce(new Error('Device query failed')); mock.history.mockRejectedValueOnce(new Error('History unavailable'));
  render(<SecuritySection />); await screen.findByText('Preferences unavailable');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(screen.queryByText('No active devices are recorded.')).not.toBeInTheDocument(); expect(screen.getByText('Phone settings available')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry sign-in preferences' })); expect(await screen.findByRole('checkbox', { name: 'Email confirmation' })).toBeChecked();
});
it('keeps enabled choices visible and disableable, but prevents unavailable new activation', async () => {
  mock.read.mockResolvedValue(prefs(false)); render(<SecuritySection />);
  expect(await screen.findByRole('checkbox', { name: 'Email confirmation' })).toBeDisabled(); expect(screen.getByRole('checkbox', { name: 'Login confirmation' })).toBeEnabled();
  expect(screen.getByText(/do not protect every sign-in method/)).toBeInTheDocument();
});
it('serializes toggles and retains failed choices and request identity until checked success', async () => {
  const pending = deferred<unknown>(); mock.update.mockReturnValueOnce(pending.promise); const view = render(<SecuritySection />);
  const email = await screen.findByRole('checkbox', { name: 'Email confirmation' }); fireEvent.click(email);
  expect(email).toBeChecked(); expect(screen.getByRole('checkbox', { name: 'Login confirmation' })).toBeDisabled(); expect(mock.update).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve(Promise.reject(new Error('Network unavailable'))));
  expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'); expect(mock.success).not.toHaveBeenCalled(); expect(email).toBeChecked();
  fireEvent.click(email); await waitFor(() => expect(email).not.toBeChecked());
  expect(mock.update.mock.calls[0].slice(0, 5)).toEqual(mock.update.mock.calls[1].slice(0, 5)); expect(mock.success).toHaveBeenCalledOnce(); view.unmount();
});
it('masks former account devices immediately and discards a late away-and-back load', async () => {
  const old = deferred<unknown>(); mock.devices.mockReturnValueOnce(old.promise); const view = render(<SecuritySection />);
  mock.epoch += 2; view.rerender(<SecuritySection />); await screen.findByText('No active devices are recorded.');
  await act(async () => old.resolve({ devices: [{ id: 'secret', deviceLabel: 'Old account private device', location: null, ip: null, trusted: false, lastSeenAt: null }], cursor: null }));
  expect(screen.queryByText('Old account private device')).not.toBeInTheDocument();
});
it.each(['account', 'unmount'])('does not sign out or celebrate a delayed revoke after %s changes', async mode => {
  const pending = deferred<unknown>(); mock.revoke.mockReturnValueOnce(pending.promise); const view = render(<SecuritySection />); await screen.findByRole('checkbox', { name: 'Email confirmation' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out all devices' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm account-wide sign-out' }));
  await waitFor(() => expect(mock.revoke).toHaveBeenCalledOnce());
  if (mode === 'account') { mock.uid = 'bob'; mock.epoch++; view.rerender(<SecuritySection />); } else view.unmount();
  await act(async () => pending.resolve({ revokedBefore: new Date().toISOString(), trackedSessionsMarked: 1 })); expect(mock.signOut).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
it('requires account-wide confirmation and keeps the same failed request for retry before local sign-out', async () => {
  mock.revoke.mockRejectedValueOnce(new Error('Sign in again before signing out all devices.')); render(<SecuritySection />); await screen.findByRole('checkbox', { name: 'Email confirmation' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out all devices' })); expect(mock.revoke).not.toHaveBeenCalled();
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Existing access can continue'); fireEvent.click(screen.getByRole('button', { name: 'Confirm account-wide sign-out' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm account-wide sign-out' })).toBeEnabled()); expect(mock.signOut).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm account-wide sign-out' })); await waitFor(() => expect(mock.signOut).toHaveBeenCalledOnce());
  expect(mock.revoke.mock.calls[0].slice(0, 2)).toEqual(mock.revoke.mock.calls[1].slice(0, 2)); expect(mock.success).toHaveBeenCalledOnce();
});
it('does not sign out a newer same-UID sign-in after receipt confirmation', async () => {
  mock.checkSignIn.mockRejectedValueOnce(new Error('Your sign-in changed')); render(<SecuritySection />); await screen.findByRole('checkbox', { name: 'Email confirmation' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out all devices' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm account-wide sign-out' }));
  await screen.findByRole('button', { name: 'Sign out here and clear this request' }); expect(mock.signOut).not.toHaveBeenCalled(); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
it('offers explicit local-only retirement for a damaged recovery record without another global mutation', async () => {
  mock.prepare.mockRejectedValueOnce(new Error('Recovery record invalid')); render(<SecuritySection />); await screen.findByRole('checkbox', { name: 'Email confirmation' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out all devices' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm account-wide sign-out' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out here and clear this request' })); await waitFor(() => expect(mock.signOut).toHaveBeenCalledOnce());
  expect(mock.retire).toHaveBeenCalledOnce(); expect(mock.revoke).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});
it('shows every device page and hides stale rows if a later page fails', async () => {
  mock.devices.mockResolvedValueOnce({ devices: [{ id: 'one', deviceLabel: 'First device', location: null, ip: null, trusted: false, lastSeenAt: null }], cursor: { id: 'one' } }).mockRejectedValueOnce(new Error('Page unavailable'));
  render(<SecuritySection />); await screen.findByText('First device'); expect(screen.getByText('Last active: Time unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more devices' })); await screen.findByRole('button', { name: 'Retry devices' }); expect(screen.queryByText('First device')).not.toBeInTheDocument();
});
