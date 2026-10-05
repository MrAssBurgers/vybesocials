import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationRequest, LocationShare } from '@/lib/locationSharingService';
import type { FriendLocationController } from './FriendMapSection';
const mocks = vi.hoisted(() => ({ controller: {} as FriendLocationController, hook: vi.fn() }));
vi.mock('@/hooks/useLocationShareWithFriend', () => ({ useLocationShareWithFriend: (...args: unknown[]) => { mocks.hook(...args); return mocks.controller; } }));
import { LocationRequestSheet } from './LocationRequestSheet';
import { FriendMapSection } from './FriendMapSection';
import { ChatLocationSharing } from '@/components/chat/ChatLocationSharing';
const share = (overrides = {}): LocationShare => ({ id: 'outgoing', revision: 'revision', sharerId: 'alice', viewerId: 'bob', precision: 'approximate', duration: '1h', active: true, paused: true, expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides });
const request = (): LocationRequest => ({ id: 'request', revision: 'revision', requesterId: 'bob', targetId: 'alice', requester: { id: 'bob', username: 'bob', displayName: null, avatarUrl: null }, target: { id: 'alice', username: 'alice', displayName: null, avatarUrl: null }, precision: 'precise', duration: '1h', customMinutes: null, message: 'Meet me?', status: 'pending', expiresAt: '2099-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', shareId: null });
const mutation = () => ({ isPending: false, mutateAsync: vi.fn().mockResolvedValue({}) });
const props = { open: true, otherProfileId: 'bob', otherUsername: 'bob', onOpenChange: vi.fn() };
const sheet = (next = {}) => <MemoryRouter><LocationRequestSheet {...props} {...next} /></MemoryRouter>;
const deferred = () => { let resolve!: (value?: unknown) => void; let reject!: (error: Error) => void; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.controller = {
    actor: { uid: 'auth-alice', profileId: 'alice', epoch: 1 }, data: { state: { enabled: false }, legacySharingNeedsReview: false },
    isReady: true, isLoading: false, isError: false, outgoingShare: undefined, incomingShare: undefined, incomingRequests: [], outgoingRequests: [],
    requestShare: mutation(), respondRequest: mutation(), pauseShare: mutation(), stopShare: mutation(), refetch: vi.fn(), guardCurrent: vi.fn(),
  } as unknown as FriendLocationController;
});
afterEach(cleanup);

describe('Checked location-sharing controls', () => {
  it('distinguishes loading and failure from no share and makes retry reachable', () => {
    mocks.controller.isReady = false; mocks.controller.data = undefined;
    const view = render(sheet());
    expect(screen.getByRole('status')).toHaveTextContent('Checking'); expect(screen.queryByRole('button', { name: 'Request location' })).toBeNull();
    mocks.controller = { ...mocks.controller, isError: true };
    view.rerender(sheet({ otherUsername: 'bob refreshed' })); fireEvent.click(screen.getByRole('button', { name: 'Retry location sharing' }));
    expect(mocks.controller.refetch).toHaveBeenCalledOnce(); expect(screen.queryByText(/No current location/)).toBeNull();
  });

  it('keeps paused outgoing controls and stops the correct incoming direction', async () => {
    const outgoing = share(), incoming = share({ id: 'incoming', sharerId: 'bob', viewerId: 'alice', paused: false });
    mocks.controller.outgoingShare = outgoing; mocks.controller.incomingShare = incoming;
    render(sheet());
    expect(screen.getByText(/Live updates are off/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Resume sharing' }));
    await waitFor(() => expect(mocks.controller.pauseShare.mutateAsync).toHaveBeenCalledWith(false));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop viewing' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop viewing' }));
    await waitFor(() => expect(mocks.controller.stopShare.mutateAsync).toHaveBeenCalledWith(incoming));
    expect(screen.getByRole('button', { name: 'Resume sharing' })).toBeVisible();
  });

  it('preserves server rejection without claiming a pause or stop succeeded', async () => {
    mocks.controller.outgoingShare = share({ paused: false });
    vi.mocked(mocks.controller.pauseShare.mutateAsync).mockRejectedValue(new Error('This share changed. Refresh location sharing.'));
    render(sheet()); fireEvent.click(screen.getByRole('button', { name: 'Pause sharing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This share changed');
    expect(screen.getByRole('button', { name: 'Pause sharing' })).toBeEnabled(); expect(screen.queryByRole('button', { name: 'Resume sharing' })).toBeNull();
  });

  it('accepts a checked request and requires explicit confirmation before blocking the person', async () => {
    const incoming = request(); mocks.controller.incomingRequests = [incoming]; render(sheet());
    expect(screen.getByText(/Accepting grants access/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Accept request' }));
    await waitFor(() => expect(mocks.controller.respondRequest.mutateAsync).toHaveBeenCalledWith({ request: incoming, intent: 'accept' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Block person' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Block person' }));
    expect(mocks.controller.respondRequest.mutateAsync).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm block' }));
    await waitFor(() => expect(mocks.controller.respondRequest.mutateAsync).toHaveBeenCalledWith({ request: incoming, intent: 'block' }));
  });

  it('sends only the selected request, locks double-submit, and retains the draft on unconfirmed failure', async () => {
    const pending = deferred(); vi.mocked(mocks.controller.requestShare.mutateAsync).mockReturnValue(pending.promise as never);
    render(sheet()); fireEvent.click(screen.getByRole('button', { name: 'Request location' }));
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: 'while_using' } });
    fireEvent.change(screen.getByLabelText('Precision'), { target: { value: 'precise' } });
    fireEvent.change(screen.getByLabelText('Optional request message'), { target: { value: '  Meet here  ' } });
    expect(screen.getByText(/app visible/)).toBeVisible();
    const form = screen.getByRole('form', { name: 'Request location' }); fireEvent.submit(form); fireEvent.submit(form);
    expect(mocks.controller.requestShare.mutateAsync).toHaveBeenCalledExactlyOnceWith({ duration: 'while_using', precision: 'precise', message: 'Meet here' });
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await act(async () => pending.reject(new Error('The request was not confirmed. Please retry.')));
    expect(screen.getByRole('alert')).toHaveTextContent('not confirmed'); expect(screen.getByLabelText('Optional request message')).toHaveValue('  Meet here  ');
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('retires a pending form across close/reopen and hides old-account errors and draft text', async () => {
    const pending = deferred(); vi.mocked(mocks.controller.requestShare.mutateAsync).mockReturnValue(pending.promise as never);
    const view = render(sheet()); fireEvent.click(screen.getByRole('button', { name: 'Request location' }));
    fireEvent.change(screen.getByLabelText('Optional request message'), { target: { value: 'private draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    view.rerender(sheet({ open: false })); view.rerender(sheet());
    fireEvent.click(screen.getByRole('button', { name: 'Request location' }));
    expect(screen.getByLabelText('Optional request message')).toHaveValue('');
    await act(async () => pending.reject(new Error('Old account failure')));
    expect(screen.queryByText('Old account failure')).toBeNull(); expect(props.onOpenChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Optional request message'), { target: { value: 'second private draft' } });
    mocks.controller = { ...mocks.controller, actor: { ...mocks.controller.actor, uid: 'new-auth', epoch: 3 } };
    view.rerender(sheet({ otherUsername: 'bob refreshed' })); expect(screen.queryByDisplayValue('second private draft')).toBeNull(); expect(screen.queryByRole('form')).toBeNull();
  });

  it('shows current sample availability without disclosing its coordinates and masks it after denial', () => {
    mocks.controller.location = { latitude: 40.125, longitude: -95.725, precision: 'approximate', updatedAt: '2026-01-01T00:00:00Z' } as FriendLocationController['location'];
    const view = render(<FriendMapSection otherProfileId="bob" onRequestLocation={vi.fn()} />);
    expect(screen.getByText('Approximate location available on VybeMap')).toBeVisible(); expect(view.container.textContent).not.toContain('40.125'); expect(view.container.textContent).not.toContain('-95.725');
    mocks.controller = { ...mocks.controller, data: undefined, isError: true, isReady: false };
    view.rerender(<FriendMapSection otherProfileId="bob" onRequestLocation={vi.fn()} />);
    expect(screen.queryByText('Approximate location available on VybeMap')).toBeNull();
  });
});

describe('Existing chat location link', () => {
  const RouteState = () => <output data-testid="route">{useLocation().search}</output>;
  it('waits for a loaded direct-message peer then opens the real controls and consumes only its own parameter', () => {
    const route = (available: boolean, otherProfileId?: string) => <MemoryRouter initialEntries={['/messages/thread?location=1&camera=1']}><ChatLocationSharing available={available} otherProfileId={otherProfileId} otherUsername="bob" /><RouteState /></MemoryRouter>;
    const view = render(route(false, 'bob')); expect(mocks.hook).not.toHaveBeenCalled();
    view.rerender(route(true)); expect(mocks.hook).not.toHaveBeenCalled();
    view.rerender(route(true, 'bob')); expect(screen.getByRole('dialog', { name: 'Location sharing' })).toBeVisible();
    expect(mocks.hook).toHaveBeenCalledWith('bob');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByTestId('route')).toHaveTextContent('?camera=1');
  });
});
