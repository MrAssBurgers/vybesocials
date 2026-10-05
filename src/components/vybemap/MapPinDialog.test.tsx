import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: {} as Record<string, unknown>, save: vi.fn(), ack: vi.fn(), refetch: vi.fn() }));
vi.mock('@/hooks/useMapPins', () => ({ useMapPinState: () => {
  const uid = state.uid, epoch = state.epoch;
  return { ...state.read, refetch: state.refetch, scope: `${uid}:${epoch}`, account: { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch } }, guardCurrent: () => { if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapPinService', () => ({ manageMapPin: (...args: unknown[]) => state.save(...args) }));
vi.mock('./MapPinAreaPicker', () => ({ MapPinAreaPicker: ({ onChoose, disabled }: { onChoose: (p: object) => void; disabled: boolean }) => <button disabled={disabled} onClick={() => onChoose({ latitude: 41.89, longitude: -87.63 })}>Choose map center</button> }));
import { MapPinDialog } from './MapPinDialog';
let client: QueryClient, sourceId: string;
const rev = 'a'.repeat(48), sourceRev = 'b'.repeat(48);
const read = (patch: object = {}) => ({ validUntil: Date.now() + 15_000, kind: 'post', sourceId, status: 'unshared', revision: null, sourceRevision: sourceRev, canShare: true, pin: null, ...patch });
function receipt(patch: object = {}) { return { ...read(), status: 'shared', revision: rev, applied: true, replayed: false, acknowledge: state.ack, ...patch }; }
function held<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; }
const content = () => <QueryClientProvider client={client}><MapPinDialog kind="post" sourceId={sourceId} onClose={vi.fn()} /></QueryClientProvider>;
function choose(label = 'Park area') { fireEvent.click(screen.getByRole('button', { name: 'Choose map center' })); fireEvent.change(screen.getByRole('textbox', { name: 'Area name' }), { target: { value: label } }); fireEvent.click(screen.getByRole('button', { name: 'Review area' })); }
function share() { fireEvent.click(screen.getByRole('button', { name: 'Share this area on map' })); }
function visibility(value: string) { act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')); }); }
beforeEach(() => {
  vi.clearAllMocks(); state.epoch++; state.uid = 'alice'; sourceId = `source-${state.epoch}`;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.read = { data: read(), isError: false }; state.save.mockImplementation(async (_actor, _input, guard) => { guard(); return receipt(); });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('deliberate map sharing dialog', () => {
  it('requires chosen area, name, review and explicit share; trims reviewed label', async () => {
    render(content()); expect(screen.getByRole('textbox', { name: 'Area name' })).toBeDisabled(); expect(state.save).not.toHaveBeenCalled();
    choose('  Park area  '); expect(state.save).not.toHaveBeenCalled(); expect(screen.getByText(/Review: share/)).toBeInTheDocument(); share();
    await waitFor(() => expect(state.ack).toHaveBeenCalledOnce());
    expect(state.save).toHaveBeenCalledWith({ uid: 'alice', profileId: 'profile-alice' }, { action: 'share', kind: 'post', sourceId, expectedRevision: null, expectedSourceRevision: sourceRev, area: { latitude: 41.89, longitude: -87.63, label: 'Park area' } }, expect.any(Function));
    expect(screen.getByRole('status')).toHaveTextContent('Map area shared');
  });
  it('keeps draft and exact uncertain body for deliberate retry after failed save', async () => {
    state.save.mockRejectedValueOnce(new Error('Connection lost')); render(content()); choose(); share();
    await screen.findByText('Connection lost'); const original = state.save.mock.calls[0][1]; expect(screen.getByRole('textbox', { name: 'Area name' })).toHaveValue('Park area');
    fireEvent.click(screen.getByRole('button', { name: 'Retry same map change' })); await waitFor(() => expect(state.ack).toHaveBeenCalledOnce()); expect(state.save.mock.calls[1][1]).toEqual(original);
  });
  it('guards duplicate submission and preserves a hidden confirmation until deliberate retry', async () => {
    const pending = held<ReturnType<typeof receipt>>(); state.save.mockReturnValueOnce(pending.promise); render(content()); choose(); share();
    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled(); expect(state.save).toHaveBeenCalledOnce();
    visibility('hidden'); visibility('visible'); await act(async () => pending.resolve(receipt())); expect(state.ack).not.toHaveBeenCalled(); expect(screen.queryByText(/Map area shared/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry same map change' })); await waitFor(() => expect(state.ack).toHaveBeenCalledOnce()); expect(state.save.mock.calls[1][1]).toEqual(state.save.mock.calls[0][1]);
  });
  it('retains unacknowledged draft across close/reopen without acknowledging a late result', async () => {
    const pending = held<ReturnType<typeof receipt>>(); state.save.mockReturnValueOnce(pending.promise); const view = render(content()); choose(); share(); const original = state.save.mock.calls[0][1];
    view.unmount(); await act(async () => pending.resolve(receipt())); expect(state.ack).not.toHaveBeenCalled(); render(content()); expect(screen.getByRole('textbox', { name: 'Area name' })).toHaveValue('Park area');
    fireEvent.click(screen.getByRole('button', { name: 'Retry same map change' })); await waitFor(() => expect(state.ack).toHaveBeenCalledOnce()); expect(state.save.mock.calls[1][1]).toEqual(original);
  });
  it('isolates draft and ignores old receipt across account ABA', async () => {
    const pending = held<ReturnType<typeof receipt>>(); state.save.mockReturnValue(pending.promise); const view = render(content()); choose(); share();
    state.uid = 'bob'; state.epoch++; view.rerender(content()); expect(screen.getByRole('textbox', { name: 'Area name' })).toHaveValue('');
    state.uid = 'alice'; state.epoch++; view.rerender(content()); expect(screen.getByRole('textbox', { name: 'Area name' })).toHaveValue('');
    await act(async () => pending.resolve(receipt())); expect(state.ack).not.toHaveBeenCalled(); expect(screen.queryByText(/Map area shared/)).not.toBeInTheDocument();
  });
  it('requires another deliberate review if source changes after review and before dispatch', () => {
    const view = render(content()); choose(); state.read = { data: read({ sourceRevision: 'c'.repeat(48) }), isError: false }; view.rerender(content()); share();
    expect(state.save).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('changed after your review'); expect(screen.getByRole('button', { name: 'Review area' })).toBeEnabled();
  });
  it.each(['denied', 'superseded', 'error'])('does not acknowledge late share after current read becomes %s', async mode => {
    const pending = held<ReturnType<typeof receipt>>(); state.save.mockReturnValue(pending.promise); const view = render(content()); choose(); share();
    state.read = mode === 'error' ? { data: undefined, isError: true } : { data: read(mode === 'denied' ? { status: 'unavailable', canShare: false, sourceRevision: null } : { revision: 'c'.repeat(48) }), isError: false }; view.rerender(content());
    await act(async () => pending.resolve(receipt())); expect(state.ack).not.toHaveBeenCalled(); expect(screen.queryByText(/Map area shared/)).not.toBeInTheDocument();
  });
  it('allows own newly committed revision to be confirmed by a concurrent fresh read', async () => {
    const pending = held<ReturnType<typeof receipt>>(); state.save.mockReturnValue(pending.promise); const view = render(content()); choose(); share();
    state.read = { data: read({ status: 'shared', revision: rev, pin: { areaLabel: 'Park area' } }), isError: false }; view.rerender(content());
    await act(async () => pending.resolve(receipt())); expect(state.ack).toHaveBeenCalledOnce(); expect(screen.getByText(/Map area shared/)).toBeInTheDocument();
  });
  it('removes retained consent even when the source is unavailable', async () => {
    state.read = { data: read({ status: 'unavailable', revision: rev, canShare: false, sourceRevision: null }), isError: false };
    state.save.mockResolvedValue(receipt({ status: 'removed', pin: null, canShare: false, sourceRevision: null })); render(content()); fireEvent.click(screen.getByRole('button', { name: 'Remove from map' }));
    await waitFor(() => expect(state.ack).toHaveBeenCalledOnce()); expect(screen.getByText('Removed from the map.')).toBeInTheDocument(); expect(state.save.mock.calls[0][1]).toEqual({ action: 'remove', kind: 'post', sourceId, expectedRevision: rev });
  });
  it('acknowledges superseded replay without announcing original area success', async () => {
    state.save.mockResolvedValue(receipt({ applied: false, status: 'removed', pin: null })); render(content()); choose(); share(); await waitFor(() => expect(state.ack).toHaveBeenCalledOnce());
    expect(screen.getByText(/earlier change was superseded/)).toBeInTheDocument(); expect(screen.queryByText(/Map area shared/)).not.toBeInTheDocument();
  });
  it('renders read failure with explicit retry and never exposes sharing controls', () => {
    state.read = { data: undefined, isError: true }; render(content()); expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'); expect(screen.queryByRole('button', { name: 'Review area' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry map sharing' })); expect(state.refetch).toHaveBeenCalledOnce();
  });
  it('does not dispatch or reject an unhandled promise when access expires at click time', async () => {
    render(content()); choose(); (state.read.data as { validUntil: number }).validUntil = Date.now() - 1; share(); await act(async () => {}); expect(state.save).not.toHaveBeenCalled(); expect(state.ack).not.toHaveBeenCalled();
  });
});
