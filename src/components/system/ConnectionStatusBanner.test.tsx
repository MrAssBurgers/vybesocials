import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { startReconnectManager } from '@/lib/reconnectManager';
import { ConnectionStatusBanner } from './ConnectionStatusBanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps one live connection announcement when recovery interrupts the offline animation', () => {
  render(<ConnectionStatusBanner />);
  act(() => window.dispatchEvent(new Event('vybe:offline')));
  expect(screen.getByRole('status')).toHaveTextContent('Offline');
  act(() => window.dispatchEvent(new Event('vybe:online')));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Back online');
  expect(screen.queryByText(/Offline —/)).toBeNull();
  act(() => window.dispatchEvent(new Event('vybe:offline')));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Offline');
});

it('shows the already-confirmed offline state when mounted after the failed probe', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('synthetic offline')));
  const stop = startReconnectManager({ refetchQueries: vi.fn(), resumePausedMutations: vi.fn() } as unknown as QueryClient);
  try {
    await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
    render(<ConnectionStatusBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  } finally { if (typeof stop === 'function') stop(); }
});
