import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useLandingTopCreators } from './useLandingTopCreators';
import { usePublicUserCount } from './usePublicUserCount';

const rpc = vi.fn();
vi.mock('@/lib/firebase', () => ({ db: { rpc } }));

function wrap({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('public marketing queries', () => {
  it('does not call a creator or member-count reader', async () => {
    const creators = renderHook(() => useLandingTopCreators(4), { wrapper: wrap });
    const count = renderHook(() => usePublicUserCount(), { wrapper: wrap });
    await waitFor(() => expect(creators.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(count.result.current.isSuccess).toBe(true));
    expect(creators.result.current.data).toEqual([]);
    expect(count.result.current.data).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
