import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
// Timer ownership is tested without exit-animation retention. The separate
// component test runs the actual Framer Motion implementation.
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: ReactNode }) => children,
  motion: { div: ({ children, role }: { children: ReactNode; role?: string }) => <div role={role}>{children}</div> } }));
import { ConnectionStatusBanner } from './ConnectionStatusBanner';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });
const event = (name: string) => act(() => window.dispatchEvent(new Event('vybe:' + name)));
it('keeps the latest recovery visible for its full interval after a second outage', async () => {
  render(<ConnectionStatusBanner />); event('offline'); event('online');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  event('offline'); event('online');
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(screen.getByRole('status')).toHaveTextContent('Back online');
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(screen.queryByRole('status')).toBeNull();
});
it('removes all owned timers on unmount and ignores later events', () => {
  const ui = render(<ConnectionStatusBanner />); event('offline'); event('online');
  ui.unmount(); expect(vi.getTimerCount()).toBe(0);
  event('offline'); event('online'); expect(vi.getTimerCount()).toBe(0);
});
it('retains reconnecting and live queue-count feedback through a failed retry', async () => {
  render(<ConnectionStatusBanner />);
  localStorage.setItem('vybe_offline_action_queue', '[{},{}]');
  event('offline'); expect(screen.getByRole('status')).toHaveTextContent('2 actions queued');
  event('reconnecting'); expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  localStorage.setItem('vybe_offline_action_queue', '[{}]');
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(screen.getByRole('status')).toHaveTextContent('1 action queued');
  event('online'); expect(screen.getByRole('status')).toHaveTextContent('syncing 1');
  event('offline'); await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
  expect(screen.getByRole('status')).toHaveTextContent('Offline');
});
