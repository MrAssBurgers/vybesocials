import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', premium: false, xp: 0, failed: false, owned: false, retry: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.uid }, profile: { id: `${mock.uid}-profile` } }) }));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ hasPremiumCosmetics: mock.premium }) }));
vi.mock('./useTokenMarketplaceState', () => ({ useTokenAction: vi.fn(), useTokenMarketplaceState: () => ({ isSuccess: !mock.failed, isError: mock.failed, refetch: mock.retry, data: { verified_total_xp: mock.xp, legacy_review: true, inventory: mock.owned ? [{ item_id: 'avatar_frame_gold', quantity: 1 }] : [], catalog: [{ id: 'avatar_frame_gold', name: 'Gold frame', kind: 'permanent', icon: '⭐', description: 'Gold frame' }] } }) }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenMarketplaceRequest: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => {
  const response = () => ({ data: table === 'profiles' ? { user_id: mock.uid, equipped_frame: 'legacy-frame' } : table === 'user_levels' ? { current_level: 99 } : [
    { id: 'free', level: 1, xp_required: 0, reward_type: 'title', reward_name: 'Starter', is_premium: false },
    { id: 'earned', level: 2, xp_required: 100, reward_type: 'effect', reward_name: 'Glow', is_premium: false },
    { id: 'premium', level: 99, xp_required: 99999, reward_type: 'name_color', reward_name: 'Pink', is_premium: true },
  ], error: null });
  const chain = { select: () => chain, eq: () => chain, single: async () => response(), maybeSingle: async () => response(), order: async () => response() }; return chain;
} } }));
import { useLockerItems } from './useLockerItems';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => { mock.uid = 'alice'; mock.premium = false; mock.xp = 0; mock.failed = false; mock.owned = false; client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); });
describe('locker entitlement display', () => {
  it('retains legacy level and appearance but does not treat old level99 as new paid or XP ownership', async () => {
    const hook = renderHook(() => useLockerItems(), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data).toMatchObject({ userLevel: 99, equippedFrame: 'legacy-frame', cosmetics: [] });
    expect(hook.result.current.data?.titles[0].unlocked).toBe(true);
    expect(hook.result.current.data?.effects[0].unlocked).toBe(false);
    expect(hook.result.current.data?.name_colors[0].unlocked).toBe(false);
  });
  it('unlocks only verified XP tiers, verified premium tiers and purchased permanent items', async () => {
    mock.xp = 100; mock.premium = true; mock.owned = true;
    const hook = renderHook(() => useLockerItems(), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data?.effects[0].unlocked).toBe(true);
    expect(hook.result.current.data?.name_colors[0].unlocked).toBe(true);
    expect(hook.result.current.data?.cosmetics[0]).toMatchObject({ unlocked: true, equip_value: 'avatar_frame_gold' });
  });
  it('disables equipment when the authority service is unavailable while retaining visible appearance', async () => {
    mock.failed = true;
    const hook = renderHook(() => useLockerItems(), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.equipmentReady).toBe(false); expect(hook.result.current.equipmentError).toBe(true);
    expect(hook.result.current.data?.equippedFrame).toBe('legacy-frame');
  });
  it('does not mix the viewing accounts paid inventory into a different profile locker', async () => {
    mock.owned = true;
    const hook = renderHook(() => useLockerItems('bob-profile'), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data?.cosmetics).toEqual([]);
  });
});
