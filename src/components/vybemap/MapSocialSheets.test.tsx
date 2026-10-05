import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, listeners: new Set<() => void>(), request: vi.fn(), createPost: vi.fn(), createComment: vi.fn(), moderate: vi.fn(), toast: vi.fn(), retryPosts: vi.fn(), postsError: false, postsLoading: false, admitted: true, member: false }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.session.uid }, profile: { id: `profile-${state.session.uid}`, user_id: state.session.uid } }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); }, reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (uid !== state.session.uid || epoch !== state.session.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/vybemap/mapSocialService', () => ({ mapSocialRequest: (...args: unknown[]) => state.request(...args), mapSocialAttempt: async (_actor: unknown, input: object) => ({ body: { ...input, requestId: 'attempt' }, complete: vi.fn() }) }));
vi.mock('@/hooks/vybemap/useVybeMap', () => ({
  usePlacePosts: () => ({ data: [], isError: state.postsError, isLoading: state.postsLoading, refetch: state.retryPosts }),
  usePlacePostComments: () => ({ data: [], isError: false, isLoading: false, refetch: vi.fn() }),
  useCreatePlacePost: () => ({ mutateAsync: state.createPost }), useCreatePlacePostComment: () => ({ mutateAsync: state.createComment }),
}));
vi.mock('@/hooks/vybemap/useLocationIntel', () => ({ useLocationIntel: () => ({ data: null, isLoading: false }) }));
vi.mock('@/components/vybemap/LocationIntelPanel', () => ({ LocationIntelPanel: () => null }));
vi.mock('@/lib/contentModeration', () => ({ containsBlockedContent: () => ({ blocked: false }) }));
vi.mock('@/lib/vybeCheck', () => ({ runPublishVybeCheck: (...args: unknown[]) => state.moderate(...args) }));
vi.mock('sonner', () => ({ toast: { success: state.toast, error: state.toast } }));
import { MeetupCreateSheet, MeetupSheet } from './MeetupSheet';
import { PlacePageSheet } from './PlacePageSheet';
const meetup = { id: 'meetup-1', host_id: 'profile-bob', title: 'Synthetic meetup', dest_latitude: 1, dest_longitude: 2, dest_label: 'Synthetic park', starts_at: '2026-10-06T10:00:00Z', member_count: 0, legacy: false, revision: 'a'.repeat(48), membership: null } as any;
const place = { id: 'place-1', created_by: 'profile-bob', name: 'Synthetic spot', category: 'hangout', latitude: 1, longitude: 2, check_in_count: 0, photo_url: 'https://example.invalid/private-photo.jpg', legacy: false, revision: 'a'.repeat(48) } as any;
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure; }); return { resolve, reject, promise }; }
let client: QueryClient;
const renderInApp = (children: ReactNode) => render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
const queryReceipt = (item: unknown) => ({ item, validUntil: Date.now() + 30000, serverTime: Date.now() });
beforeEach(() => {
  vi.clearAllMocks(); state.session = { uid: 'alice', epoch: state.session.epoch + 1 }; state.listeners.clear(); state.postsError = false; state.postsLoading = false; state.admitted = true; state.member = false;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, refetchOnMount: false } } });
  state.moderate.mockResolvedValue({ allowed: true, blocked: false }); state.createPost.mockResolvedValue({ ok: true });
  state.request.mockImplementation(async (_actor, input) => {
    if (input.action === 'read') return queryReceipt(state.admitted ? input.kind === 'place' ? place : { ...meetup, membership: state.member ? { status: 'going', revision: 'b'.repeat(48) } : null } : null);
    if (input.action === 'joinMeetup' || input.action === 'leaveMeetup') { state.member = input.action === 'joinMeetup'; return { resourceId: meetup.id, status: state.member ? 'going' : 'left', item: meetup }; }
    throw new Error('Unexpected request');
  });
});
afterEach(() => { cleanup(); client.clear(); });
describe('existing map sheet acknowledgements', () => {
  it('retains failed meetup title/details and allows an explicit retry after one duplicate-safe request', async () => {
    const held = deferred<void>(), submit = vi.fn().mockReturnValueOnce(held.promise).mockResolvedValue(undefined), close = vi.fn();
    renderInApp(<MeetupCreateSheet coords={[1, 2]} onClose={close} onSubmit={submit} />);
    fireEvent.change(screen.getByPlaceholderText("What's the plan?"), { target: { value: 'Lunch' } }); fireEvent.change(screen.getByPlaceholderText('Optional details…'), { target: { value: 'Bring a picnic' } });
    const button = screen.getByRole('button', { name: 'Create meetup' }); fireEvent.click(button); fireEvent.click(button); expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { held.reject(new Error('Offline')); await held.promise.catch(() => {}); });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm'); expect(screen.getByPlaceholderText("What's the plan?")).toHaveValue('Lunch'); expect(screen.getByPlaceholderText('Optional details…')).toHaveValue('Bring a picnic'); expect(close).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Create meetup' })); await waitFor(() => expect(close).toHaveBeenCalledTimes(1)); expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0]); expect(state.toast).toHaveBeenCalledWith('Meetup created!');
  });
  it('suppresses late meetup success and close after logout/account retirement', async () => {
    const held = deferred<void>(), close = vi.fn(); renderInApp(<MeetupCreateSheet coords={[1, 2]} onClose={close} onSubmit={() => held.promise} />);
    fireEvent.change(screen.getByPlaceholderText("What's the plan?"), { target: { value: 'Lunch' } }); fireEvent.click(screen.getByRole('button', { name: 'Create meetup' }));
    act(() => { state.session = { uid: 'bob', epoch: state.session.epoch + 1 }; for (const fn of state.listeners) fn(); });
    await act(async () => { held.resolve(); await held.promise; }); expect(state.toast).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });
  it('joins and leaves using the checked current membership revision and refetched status', async () => {
    renderInApp(<MeetupSheet meetup={meetup} myCoords={null} onClose={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    const leave = await screen.findByRole('button', { name: 'Leave' }); expect(state.request).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ action: 'joinMeetup', meetupId: 'meetup-1', expectedRevision: null }), expect.any(Function));
    fireEvent.click(leave); await screen.findByRole('button', { name: 'Join' }); expect(state.request).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ action: 'leaveMeetup', expectedRevision: 'b'.repeat(48) }), expect.any(Function));
  });
  it('never submits a place post after moderation resolves for an unmounted view', async () => {
    const held = deferred<{ allowed: boolean; blocked: boolean }>(); state.moderate.mockReturnValue(held.promise);
    const ui = renderInApp(<PlacePageSheet place={place} onClose={vi.fn()} onNavigate={vi.fn()} />); const input = await screen.findByPlaceholderText('Share a tip, vibe, or question…');
    await screen.findByRole('button', { name: 'Post to spot' }); fireEvent.change(input, { target: { value: 'A synthetic tip' } }); fireEvent.keyDown(input, { key: 'Enter' }); ui.unmount();
    await act(async () => { held.resolve({ allowed: true, blocked: false }); await held.promise; }); expect(state.createPost).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('serializes double Enter while the checked moderation request is pending', async () => {
    const held = deferred<{ allowed: boolean; blocked: boolean }>(); state.moderate.mockReturnValue(held.promise);
    renderInApp(<PlacePageSheet place={place} onClose={vi.fn()} onNavigate={vi.fn()} />); await screen.findByRole('button', { name: 'Post to spot' }); const input = screen.getByPlaceholderText('Share a tip, vibe, or question…');
    fireEvent.change(input, { target: { value: 'One tip' } }); fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.keyDown(input, { key: 'Enter' }); expect(state.moderate).toHaveBeenCalledTimes(1);
    await act(async () => { held.resolve({ allowed: true, blocked: false }); await held.promise; }); await waitFor(() => expect(state.createPost).toHaveBeenCalledTimes(1));
  });
  it('shows a checked feed read error with Retry instead of claiming the spot has no posts', async () => {
    state.postsError = true; renderInApp(<PlacePageSheet place={place} onClose={vi.fn()} onNavigate={vi.fn()} />); const retry = await screen.findByRole('button', { name: 'Retry posts' });
    expect(screen.queryByText('No posts yet — be first!')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Post to spot' })).toBeDisabled(); fireEvent.click(retry); expect(state.retryPosts).toHaveBeenCalledTimes(1);
  });
  it('unmounts the admitted spot photo and text after a fresh read withdraws access', async () => {
    renderInApp(<PlacePageSheet place={place} onClose={vi.fn()} onNavigate={vi.fn()} />); await screen.findByRole('button', { name: 'Post to spot' }); expect(document.querySelector(`img[src="${place.photo_url}"]`)).not.toBeNull();
    state.admitted = false; await act(() => client.refetchQueries({ queryKey: ['map-social'] })); await screen.findByText('This spot is no longer available.');
    expect(document.querySelector(`img[src="${place.photo_url}"]`)).toBeNull(); expect(screen.queryByText('Synthetic spot')).not.toBeInTheDocument();
  });
});
