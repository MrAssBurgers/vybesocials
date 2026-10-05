import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as realDelay } from 'node:timers/promises';
import { squadFixture, squadTime, squadDeferred } from '@/test/mapSquadFixture';
import type { MapGroupMap } from '@/lib/vybemap/types';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, call: vi.fn(), copy: vi.fn(), user: { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } } }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => { const uid = state.uid, epoch = state.epoch; return { user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, ready: !!uid, guard: () => { if (!uid || state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } }; } }));
vi.mock('@/lib/profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra: () => void) => { const epoch = state.epoch; return () => { extra(); if (state.uid !== uid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.user }) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => state.call(...args) }));
import { GroupMapSheet } from './GroupMapSheet';
let client: QueryClient, group: MapGroupMap | null;
const token = 'e'.repeat(64);
const onClose = vi.fn(), onSelect = vi.fn();
const renderPanel = (initialInvite?: string) => render(<QueryClientProvider client={client}><GroupMapSheet onClose={onClose} onSelect={onSelect} initialInvite={initialInvite} /></QueryClientProvider>);
function receipt(input: any, fields: object) { return { data: { ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, accountCreatedAt: input.expectedAccountCreatedAt, action: input.action, ...squadTime(), ...fields }, error: null }; }
function dispatch(_name: string, input: any): any {
  if (input.action === 'list') return receipt(input, { items: group ? [group] : [], nextCursor: null });
  if (input.action === 'read') return receipt(input, { squadId: input.squadId, squad: group, members: group && !group.legacy ? [{ profile_id: group.owner_id, username: 'Squad owner', display_name: null, avatar_url: null, role: 'owner' }] : [], nextCursor: null });
  if (input.action === 'previewInvite') return receipt(input, { token: input.token, invite: group ? { squad: group, expiresAt: Date.now() + 86_400_000 } : null });
  if (input.action === 'create') group = squadFixture({ name: input.name, emoji: input.emoji });
  if (input.action === 'recreate') group = squadFixture({ id: 'replacement-squad', name: group!.name });
  if (input.action === 'archive' || input.action === 'leave') { group = null; return receipt(input, { requestId: input.requestId, squadId: input.squadId, status: input.action === 'archive' ? 'archived' : 'left', squad: null, membership: input.action === 'leave' ? { role: 'member', status: 'left', revision: 'f'.repeat(48) } : null }); }
  return receipt(input, { requestId: input.requestId, squadId: group!.id, status: 'active', squad: group, membership: group!.membership, ...(input.action === 'createInvite' ? { invite: { token, active: true, expiresAt: Date.now() + 86_400_000 } } : {}) });
}
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.uid = 'alice'; state.epoch++; state.user = { uid: 'alice', metadata: { creationTime: '2026-01-01T00:00:00Z' } }; group = null; state.call.mockImplementation(dispatch); state.copy.mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: state.copy } }); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: old => old, refetchOnMount: false, gcTime: 14 * 86400_000 } } }); });
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
const writes = (action: string) => state.call.mock.calls.filter(([, input]) => input.action === action);
const openGroup = async () => { fireEvent.click(await screen.findByRole('button', { name: /Friday crew/ })); await screen.findByRole('button', { name: 'Highlight on map' }); };
const realNow = Date.now;
/** Native WebCrypto is not controlled by fake timers. Wait for the actual UI
 * acknowledgement without spending the expiry window we are about to test. */
async function settled(assertion: () => void) {
  const deadline = realNow() + 2000;
  while (realNow() < deadline) {
    await act(async () => { await realDelay(5); await vi.advanceTimersByTimeAsync(0); });
    try { assertion(); return; } catch { /* Keep waiting for the observed receipt, not an assumed delay. */ }
  }
  assertion();
}
async function openTimedGroup() {
  await settled(() => expect(screen.getByRole('button', { name: /Friday crew/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Friday crew/ }));
  await settled(() => expect(screen.getByRole('button', { name: 'Generate 24-hour invitation' })).toBeEnabled());
}
async function generateTimedInvite() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate 24-hour invitation' }));
  await settled(() => expect(screen.getByLabelText('Invitation code')).toHaveValue(token));
}
describe('usable checked squad panel', () => {
  it('shows loading and retry on failed reads instead of false empty results', async () => {
    const held = squadDeferred<any>(); state.call.mockReturnValue(held.promise); renderPanel(); expect(screen.getByRole('status')).toHaveTextContent('Checking your squads');
    await act(async () => held.resolve({ data: null, error: { name: 'unavailable', message: 'Offline' } })); const retry = await screen.findByRole('button', { name: 'Retry squads' }); expect(screen.queryByText('No squads in this group of results.')).not.toBeInTheDocument();
    state.call.mockImplementation(dispatch); fireEvent.click(retry); await screen.findByText('No squads in this group of results.');
  });
  it('retains failed create drafts, prevents duplicate submits and retries with the same UUID', async () => {
    const held = squadDeferred<any>(); state.call.mockImplementation((name, input) => input.action === 'create' ? held.promise : dispatch(name, input)); renderPanel();
    fireEvent.change(screen.getByLabelText('Squad name'), { target: { value: 'My crew' } }); const create = screen.getByRole('button', { name: 'Create squad map' }); fireEvent.click(create); fireEvent.click(create); await waitFor(() => expect(writes('create')).toHaveLength(1)); expect(screen.getByLabelText('Squad name')).toBeDisabled();
    await act(async () => held.resolve({ data: null, error: { name: 'unavailable', message: 'Could not save' } })); await screen.findByText('Could not save'); expect(screen.getByLabelText('Squad name')).toHaveValue('My crew');
    state.call.mockImplementation(dispatch); fireEvent.click(screen.getByRole('button', { name: 'Create squad map' })); await screen.findByRole('button', { name: 'Generate 24-hour invitation' });
    expect(writes('create')[1][1].requestId).toBe(writes('create')[0][1].requestId); expect(onSelect).not.toHaveBeenCalled();
  });
  it('keeps a hidden committed creation retry bound to its original request until visible acknowledgement', async () => {
    const held = squadDeferred<any>(); let original: any;
    state.call.mockImplementation((name, input) => { if (input.action === 'create') { original = input; return held.promise; } return dispatch(name, input); }); renderPanel();
    fireEvent.change(screen.getByLabelText('Squad name'), { target: { value: 'Hidden reply crew' } }); fireEvent.click(screen.getByRole('button', { name: 'Create squad map' })); await waitFor(() => expect(original).toBeDefined());
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => held.resolve(dispatch('manageMapSquad', original)));
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByLabelText('Squad name')).toHaveValue('Hidden reply crew'); state.call.mockImplementation(dispatch);
    fireEvent.click(await screen.findByRole('button', { name: 'Create squad map' })); await screen.findByRole('button', { name: 'Generate 24-hour invitation' }); expect(writes('create')[1][1].requestId).toBe(original.requestId);
  });
  it('requires explicit invitation review and join consent; loading a code never autojoins', async () => {
    group = squadFixture({ owner_id: 'profile-bob', membership: { role: 'member', status: 'active', revision: 'b'.repeat(48) } }); renderPanel(token);
    expect(writes('previewInvite')).toHaveLength(0); expect(writes('join')).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Review invitation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Join this squad' })); await screen.findByRole('button', { name: 'Leave squad' }); expect(writes('join')).toHaveLength(1); expect(screen.getByText(/Joining a squad never turns on/)).toBeInTheDocument();
  });
  it('does not revive a preview completed across hide then foreground', async () => {
    group = squadFixture(); const held = squadDeferred<any>(); let input: any; state.call.mockImplementation((name, request) => { if (request.action === 'previewInvite') { input = request; return held.promise; } return dispatch(name, request); }); renderPanel(token); fireEvent.click(screen.getByRole('button', { name: 'Review invitation' })); await waitFor(() => expect(input).toBeDefined());
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => held.resolve(dispatch('manageMapSquad', input))); expect(screen.queryByRole('button', { name: 'Join this squad' })).not.toBeInTheDocument(); expect(writes('join')).toHaveLength(0);
  });
  it('removes Join when the checked invitation lease expires', async () => {
    vi.useFakeTimers(); group = squadFixture(); state.call.mockImplementation((name, input) => input.action === 'previewInvite' ? receipt(input, { token: input.token, invite: { squad: group, expiresAt: Date.now() + 100 }, validUntil: Date.now() + 100 }) : dispatch(name, input)); renderPanel(token);
    fireEvent.click(screen.getByRole('button', { name: 'Review invitation' })); await settled(() => expect(screen.getByRole('button', { name: 'Join this squad' })).toBeInTheDocument());
    await act(async () => { await vi.advanceTimersByTimeAsync(101); }); expect(screen.queryByRole('button', { name: 'Join this squad' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Check invitation again' })).toBeInTheDocument(); expect(writes('join')).toHaveLength(0);
  });
  it('retires old account drafts and late responses during Alice to Bob to Alice', async () => {
    const held = squadDeferred<any>(); let original: any; state.call.mockImplementation((name, input) => { if (input.action === 'create') { original = input; return held.promise; } return dispatch(name, input); }); const ui = renderPanel();
    fireEvent.change(screen.getByLabelText('Squad name'), { target: { value: 'Private draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Create squad map' })); await waitFor(() => expect(original).toBeDefined());
    state.uid = 'bob'; state.epoch++; state.user = { ...state.user, uid: 'bob' }; ui.rerender(<QueryClientProvider client={client}><GroupMapSheet onClose={onClose} onSelect={onSelect} /></QueryClientProvider>);
    state.uid = 'alice'; state.epoch++; state.user = { ...state.user, uid: 'alice' }; ui.rerender(<QueryClientProvider client={client}><GroupMapSheet onClose={onClose} onSelect={onSelect} /></QueryClientProvider>);
    await act(async () => held.resolve(dispatch('manageMapSquad', original))); expect(screen.getByLabelText('Squad name')).toHaveValue(''); expect(onSelect).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });
  it('copies only on explicit click, reports clipboard failure and archives only after confirmation', async () => {
    group = squadFixture(); renderPanel(); await openGroup(); expect(screen.queryByRole('button', { name: 'Leave squad' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Generate 24-hour invitation' }));
    const copy = await screen.findByRole('button', { name: 'Copy invitation link' }); expect(state.copy).not.toHaveBeenCalled(); state.copy.mockRejectedValue(new Error('Clipboard denied')); fireEvent.click(copy); await screen.findByText('Clipboard denied'); expect(state.copy).toHaveBeenCalledWith(`${location.origin}/map#squad-invite=${token}`);
    fireEvent.click(screen.getByRole('button', { name: 'Archive squad' })); expect(writes('archive')).toHaveLength(0); fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' })); await screen.findByText('No squads in this group of results.'); expect(writes('archive')[0][1].expectedRevision).toBe('a'.repeat(48));
  });
  it('does not show a delayed clipboard acknowledgement after the sheet closes', async () => {
    group = squadFixture(); const held = squadDeferred<void>(); state.copy.mockReturnValue(held.promise); const ui = renderPanel(); await openGroup(); fireEvent.click(screen.getByRole('button', { name: 'Generate 24-hour invitation' })); fireEvent.click(await screen.findByRole('button', { name: 'Copy invitation link' })); ui.unmount();
    await act(async () => held.resolve()); expect(screen.queryByText(/Invitation link copied/)).not.toBeInTheDocument(); expect(onSelect).not.toHaveBeenCalled();
  });
  it('keeps a generated invitation copyable beyond 15 seconds while current owner reads refresh, then hides on denial', async () => {
    vi.useFakeTimers(); group = squadFixture(); renderPanel(); await openTimedGroup(); await generateTimedInvite();
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); }); await settled(() => expect(screen.getByLabelText('Invitation code')).toHaveValue(token)); fireEvent.click(screen.getByRole('button', { name: 'Copy invitation link' })); await settled(() => expect(screen.getByText('Invitation link copied.')).toBeInTheDocument()); expect(state.copy).toHaveBeenCalledOnce(); expect(writes('createInvite')).toHaveLength(1);
    group = null; await act(async () => { await client.refetchQueries({ queryKey: ['vybemap-group-members'] }); }); await settled(() => expect(screen.getByText('This squad is no longer available to you.')).toBeInTheDocument()); expect(screen.queryByRole('button', { name: 'Copy invitation link' })).not.toBeInTheDocument(); expect(screen.queryByLabelText('Invitation code')).not.toBeInTheDocument();
  });
  it('removes the generated invitation at its actual expiry while owner admission remains current', async () => {
    vi.useFakeTimers(); group = squadFixture(); state.call.mockImplementation((name, input) => input.action === 'createInvite' ? receipt(input, { requestId: input.requestId, squadId: group!.id, status: 'active', squad: group, membership: group!.membership, invite: { token, active: true, expiresAt: Date.now() + 2000 } }) : dispatch(name, input));
    renderPanel(); await openTimedGroup();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, data) => { await realDelay(60); return digest(algorithm, data); });
    await generateTimedInvite();
    await act(async () => { await vi.advanceTimersByTimeAsync(2001); }); expect(screen.queryByRole('button', { name: 'Copy invitation link' })).not.toBeInTheDocument(); expect(screen.getByText('This invitation has expired. Generate a new invitation to share.')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Highlight on map' })).toBeInTheDocument();
  });
  it('clears generated tokens on hide and checks current owner access again after clipboard completion', async () => {
    group = squadFixture(); const held = squadDeferred<void>(); state.copy.mockReturnValue(held.promise); renderPanel(); await openGroup(); fireEvent.click(screen.getByRole('button', { name: 'Generate 24-hour invitation' })); fireEvent.click(await screen.findByRole('button', { name: 'Copy invitation link' }));
    group = null; await act(async () => { await client.refetchQueries({ queryKey: ['vybemap-group-members'] }); }); await screen.findByText('This squad is no longer available to you.'); await act(async () => held.resolve()); expect(screen.queryByText('Invitation link copied.')).not.toBeInTheDocument();
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); group = squadFixture(); act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await screen.findByRole('button', { name: 'Generate 24-hour invitation' }); expect(screen.queryByLabelText('Invitation code')).not.toBeInTheDocument();
  });
  it('leaves only with the current member revision and never treats a rejoined replay as left', async () => {
    group = squadFixture({ owner_id: 'profile-bob', membership: { role: 'member', status: 'active', revision: 'b'.repeat(48) } }); state.call.mockImplementation((name, input) => input.action === 'leave' ? receipt(input, { requestId: input.requestId, squadId: group!.id, status: 'active', squad: group, membership: group!.membership }) : dispatch(name, input)); renderPanel(); await openGroup();
    fireEvent.click(screen.getByRole('button', { name: 'Leave squad' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm leave' })); await screen.findByText('The squad changed. Refresh before trying again.'); expect(writes('leave')[0][1].expectedMembershipRevision).toBe('b'.repeat(48)); expect(screen.getByRole('button', { name: 'Leave squad' })).toBeInTheDocument();
  });
  it('requires deliberate legacy recreation and never displays old members as current', async () => {
    group = squadFixture({ legacy: true, status: 'legacy', membership: null, member_count: 0 }); renderPanel(); fireEvent.click(await screen.findByRole('button', { name: /Friday crew/ })); fireEvent.click(await screen.findByRole('button', { name: 'Review new squad' }));
    expect(writes('recreate')).toHaveLength(0); expect(screen.queryByRole('button', { name: 'Highlight on map' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Confirm new squad' })); await screen.findByRole('button', { name: /Friday crew/ }); expect(writes('recreate')[0][1]).toMatchObject({ legacySquadId: 'squad-one', expectedRevision: 'a'.repeat(48) });
  });
});
