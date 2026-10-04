import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn(), clear: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `profile-${mock.uid}`, user_id: mock.uid } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: mock.uid, epoch: mock.epoch }) }));
vi.mock('@/lib/contactDiscoveryService', () => ({ captureContactActor: (uid: string, profileId: string, view: () => void) => { const epoch = mock.epoch; return { uid, profileId, guard: () => { if (uid !== mock.uid || epoch !== mock.epoch) throw new Error('Changed'); view(); } }; } }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ eq: mock.read }), delete: () => ({ eq: mock.clear }) }) } }));
import { LegacyContactUploads } from './LegacyContactUploads';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { mock.uid = 'alice'; mock.epoch = 1; mock.read.mockReset().mockResolvedValue({ count: 2, error: null }); mock.clear.mockReset().mockResolvedValue({ error: null }); });
afterEach(cleanup);
it('clears only the captured owner after deliberate confirmation and acknowledges actual success', async () => {
  render(<LegacyContactUploads />); const button = await screen.findByRole('button', { name: 'Clear previous uploaded contacts (2)' });
  expect(mock.clear).not.toHaveBeenCalled(); fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('button', { name: /Clear previous/ })).not.toBeInTheDocument());
  expect(mock.clear).toHaveBeenCalledWith('user_id', 'alice');
});
it('retains a failed deletion and offers another attempt without claiming cleanup', async () => {
  mock.clear.mockResolvedValueOnce({ error: new Error('Denied') }); render(<LegacyContactUploads />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clear previous uploaded contacts (2)' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be cleared'); expect(screen.getByRole('button', { name: 'Clear previous uploaded contacts (2)' })).toBeEnabled();
});
it('does not expose the previous account count after a delayed load or clear', async () => {
  const pending = deferred<unknown>(); mock.read.mockReturnValueOnce(pending.promise); const view = render(<LegacyContactUploads />);
  mock.uid = 'bob'; mock.epoch++; mock.read.mockResolvedValue({ count: 0, error: null }); view.rerender(<LegacyContactUploads />);
  await act(async () => { pending.resolve({ count: 99, error: null }); });
  expect(screen.queryByRole('button', { name: /Clear previous/ })).not.toBeInTheDocument(); expect(mock.clear).not.toHaveBeenCalled();
});
it('shows failed historical lookup instead of claiming there are no retained uploads', async () => {
  mock.read.mockResolvedValue({ count: null, error: new Error('Offline') }); render(<LegacyContactUploads />);
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be checked'); expect(screen.queryByRole('button', { name: /Clear previous/ })).not.toBeInTheDocument();
});
