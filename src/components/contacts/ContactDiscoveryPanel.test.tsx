import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 1, pick: vi.fn(), match: vi.fn(), state: vi.fn(), friend: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `profile-${mock.uid}`, user_id: mock.uid } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/nativeContacts', () => ({ readDeviceContacts: mock.pick }));
vi.mock('@/lib/profileFriendshipAction', () => ({ profileFriendshipAction: mock.friend }));
vi.mock('./LegacyContactUploads', () => ({ LegacyContactUploads: () => null }));
vi.mock('@/lib/contactDiscoveryService', () => ({
  captureContactActor: (uid: string, profileId: string, view: () => void) => { const epoch = mock.epoch; return { uid, profileId, guard: () => { if (mock.uid !== uid || mock.epoch !== epoch) throw new Error('Account changed'); view(); } }; },
  contactDiscoveryState: mock.state, matchDeviceContacts: mock.match, contactFailureMessage: (error: Error) => error.message,
}));
import { ContactDiscoveryPanel } from './ContactDiscoveryPanel';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const empty = { matches: [], invites: [], checked: 1, skipped: 0, limited: false };
const bob = { id: 'profile-bob', username: 'bob', display_name: 'Bob', avatar_url: null, is_verified: false, phone_hash: 'a'.repeat(64) };
const settings = { success: true, ownerUid: 'alice', profileId: 'profile-alice', eligible: true, discoverable: false, maskedPhone: '+•••0100', legacyPhoneNeedsVerification: false };
beforeEach(() => { mock.uid = 'alice'; mock.epoch = 1; mock.pick.mockReset().mockResolvedValue([{ name: 'Bob', phones: ['+15555550100'] }]); mock.state.mockReset().mockResolvedValue(settings); mock.match.mockReset().mockResolvedValue(empty); mock.friend.mockReset().mockResolvedValue({ ok: true }); });
afterEach(cleanup);
it('keeps picker cancellation idle instead of claiming nobody was found', async () => {
  mock.pick.mockRejectedValue(new Error('contacts_cancelled')); render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Choose contacts' })).toBeEnabled());
  expect(mock.match).not.toHaveBeenCalled(); expect(screen.queryByText(/people found/)).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('retains a real failed search and retries without a false empty result', async () => {
  mock.match.mockRejectedValueOnce(new Error('Service unavailable')); render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable'); expect(screen.queryByText(/people found/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts again' }));
  expect(await screen.findByText('0 discoverable people found from 1 numbers.')).toBeInTheDocument();
});
it('ignores a pending device picker after cancel without sending its contacts', async () => {
  const picker = deferred<unknown[]>(); mock.pick.mockReturnValue(picker.promise); render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }));
  await act(async () => { picker.resolve([{ name: 'Private', phones: ['+15555550100'] }]); });
  expect(mock.match).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Choose contacts' })).toBeEnabled();
});
it('discards a pending picker across Alice to Bob to Alice', async () => {
  const picker = deferred<unknown[]>(); mock.pick.mockReturnValue(picker.promise); const view = render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' }));
  mock.uid = 'bob'; mock.epoch++; view.rerender(<ContactDiscoveryPanel />); mock.uid = 'alice'; mock.epoch++; view.rerender(<ContactDiscoveryPanel />);
  await act(async () => { picker.resolve([{ name: 'Private', phones: ['+15555550100'] }]); });
  expect(mock.match).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Choose contacts' })).toBeEnabled();
});
it('never paints a late match after an account switch or an unmounted screen', async () => {
  const response = deferred<unknown>(); mock.match.mockReturnValue(response.promise); const view = render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' })); await waitFor(() => expect(mock.match).toHaveBeenCalled());
  mock.uid = 'bob'; mock.epoch++; view.rerender(<ContactDiscoveryPanel />);
  await act(async () => { response.resolve({ ...empty, matches: [bob] }); });
  expect(screen.queryByText('@bob')).not.toBeInTheDocument(); view.unmount();
});
it('does not begin matching when a picker resolves after its screen unmounts', async () => {
  const picker = deferred<unknown[]>(); mock.pick.mockReturnValue(picker.promise); const view = render(<ContactDiscoveryPanel />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' })); view.unmount();
  await act(async () => { picker.resolve([{ name: 'Private', phones: ['+15555550100'] }]); });
  expect(mock.match).not.toHaveBeenCalled();
});
it('does not show an opt-in until acknowledged and explains legacy phone ineligibility', async () => {
  mock.state.mockResolvedValueOnce({ ...settings, eligible: false, maskedPhone: null, legacyPhoneNeedsVerification: true });
  render(<ContactDiscoveryPanel settings />);
  expect(await screen.findByText(/Previous SMS verification does not link/)).toBeInTheDocument(); expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Choose contacts' })).toBeEnabled();
});
it('keeps failed preference off, and does not falsely confirm a failed friend request', async () => {
  mock.match.mockResolvedValue({ ...empty, matches: [bob] }); render(<ContactDiscoveryPanel settings />);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled()); mock.state.mockRejectedValueOnce(new Error('Preference denied'));
  fireEvent.click(screen.getByRole('switch')); expect(await screen.findByText('Preference denied')).toBeInTheDocument(); expect(screen.getByRole('switch')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Choose contacts' })); await screen.findByText('@bob'); mock.friend.mockRejectedValueOnce(new Error('Request denied'));
  fireEvent.click(screen.getByRole('button', { name: 'Add' })); expect(await screen.findByText('Request denied')).toBeInTheDocument(); expect(screen.queryByText('Requested')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add' })); expect(await screen.findByText('Requested')).toBeInTheDocument();
  expect(mock.friend).toHaveBeenCalledWith({ action: 'send', targetId: 'profile-bob', expectedOwnerUid: 'alice' }, expect.any(Function));
});
