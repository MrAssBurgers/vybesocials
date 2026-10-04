import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageReportDialog } from './MessageReportDialog';

const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((user: { uid: string }) => void), invoke: vi.fn(), close: vi.fn(), success: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged: (listener: typeof state.listener) => { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: vi.fn() } }));
const ack = { data: { success: true, reportId: 'confirmed-report', status: 'pending' } };
const clients: QueryClient[] = [];
function view(client: QueryClient, message = 'message-a', conversation = 'conversation-a') { return <QueryClientProvider client={client}><MessageReportDialog messageId={message} conversationId={conversation} onClose={state.close} /></QueryClientProvider>; }
function mount() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); clients.push(client); return { client, ...render(view(client)) }; }
function submit(reason = 'Spam') { fireEvent.click(screen.getByRole('button', { name: reason, exact: true })); fireEvent.click(screen.getByRole('button', { name: 'Submit Report' })); }
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.clearAllMocks(); state.invoke.mockReset(); state.uid = 'alice'; state.listener?.({ uid: 'alice' }); sessionStorage.clear(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); });

describe('message report dialog', () => {
  it('keeps the selected reason and dialog on failure, then closes only on a confirmed retry', async () => {
    state.invoke.mockResolvedValueOnce({ error: { code: 'unavailable', message: 'Unavailable' } }).mockResolvedValueOnce(ack);
    mount();
    expect(screen.getByText(/Submitting shares a copy of this message/)).toBeInTheDocument();
    submit('Harassment');
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t submit your report');
    expect(screen.getByRole('button', { name: 'Harassment', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(state.close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    await waitFor(() => expect(state.close).toHaveBeenCalledTimes(1));
    expect(state.invoke.mock.calls[1][1]).toEqual(state.invoke.mock.calls[0][1]);
    expect(state.invoke.mock.calls[0][1]).toMatchObject({ targetType: 'message', targetId: 'message-a', reason: 'harassment' });
    expect(state.success).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate clicks and cancellation while the request is pending', async () => {
    let resolve!: (value: unknown) => void; state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount(); submit();
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }));
    expect(state.invoke).toHaveBeenCalledTimes(1); expect(state.close).not.toHaveBeenCalled();
    await act(async () => { resolve(ack); });
    await waitFor(() => expect(state.close).toHaveBeenCalledTimes(1));
  });
  it.each(['target', 'account'])('an old %s completion cannot close or unlock a new report form', async change => {
    const resolvers: ((value: unknown) => void)[] = []; state.invoke.mockImplementation(() => new Promise(done => { resolvers.push(done); }));
    const page = mount(); submit('Harassment');
    await waitFor(() => expect(resolvers).toHaveLength(1));
    if (change === 'account') { state.uid = 'bob'; state.listener?.({ uid: 'bob' }); }
    page.rerender(view(page.client, 'message-b', 'conversation-b'));
    expect(screen.getByRole('button', { name: 'Harassment', exact: true })).toHaveAttribute('aria-pressed', 'false');
    submit('Spam');
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => { resolvers[0](ack); });
    expect(state.close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Spam', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { resolvers[1](ack); });
    await waitFor(() => expect(state.close).toHaveBeenCalledTimes(1));
    expect(state.success).toHaveBeenCalledTimes(1);
  });
  it('does not run dialog callbacks after route unmount', async () => {
    let resolve!: (value: unknown) => void; state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const page = mount(); submit(); await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    page.unmount(); await act(async () => { resolve(ack); });
    expect(state.close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
});
