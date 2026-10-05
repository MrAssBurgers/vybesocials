import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'alice' } as { id: string } | null, profile: { id: 'profile-alice', user_id: 'alice', onboarding_completed: true } as any, session: { uid: 'alice' as string | undefined, epoch: 1 }, listeners: new Set<() => void>(), rpc: vi.fn(), haptic: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: (...args: unknown[]) => state.rpc(...args) } }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => state.session,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (!uid || state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); }; },
}));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: true }) }));
vi.mock('@/lib/haptics', () => ({ haptics: { success: state.haptic } }));
vi.mock('sonner', () => ({ toast: { success: state.toast, error: state.toast } }));
import { StreakProvider } from './StreakProvider';
const receipt = (streak = 1, extended = true) => ({ data: { success: true, streak, longest_streak: streak, is_new_day: extended, streak_extended: extended }, error: null });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let client: QueryClient;
const view = () => <QueryClientProvider client={client}><StreakProvider><p>Current page</p></StreakProvider></QueryClientProvider>;
function change(uid?: string) {
  state.session = { uid, epoch: state.session.epoch + 1 };
  state.user = uid ? { id: uid } : null;
  state.profile = uid ? { id: `profile-${uid}`, user_id: uid, onboarding_completed: true } : null;
  for (const listener of state.listeners) listener();
}
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); change('alice'); state.listeners.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, gcTime: 14 * 86400000, refetchOnMount: false } } });
  state.rpc.mockResolvedValue(receipt());
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('streak overlay retirement', () => {
  it('does not show a delayed login receipt on the signed-out landing page', async () => {
    const held = deferred<ReturnType<typeof receipt>>();
    state.rpc.mockImplementation((name: string) => name === 'update_login_streak' ? held.promise : Promise.resolve(receipt()));
    const ui = render(view()); await tick(3500);
    act(() => change()); ui.rerender(view());
    held.resolve(receipt(1)); await tick(5000);
    expect(screen.queryByText('1 Day Streak!')).not.toBeInTheDocument();
    expect(screen.queryByText('Keep It Burning!')).not.toBeInTheDocument();
    expect(state.haptic).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('removes an already visible popup immediately when its account signs out', async () => {
    const ui = render(view()); await tick(4000);
    expect(screen.getByText('1 Day Streak!')).toBeInTheDocument();
    act(() => change()); ui.rerender(view());
    expect(screen.queryByText('Keep It Burning!')).not.toBeInTheDocument();
  });
  it('rejects an old Alice result after Alice→Bob→Alice and does not revive an old timer', async () => {
    const held = deferred<ReturnType<typeof receipt>>(); let updates = 0;
    state.rpc.mockImplementation((name: string) => name === 'update_login_streak' && ++updates === 1 ? held.promise : Promise.resolve(receipt(2, false)));
    const ui = render(view()); await tick();
    act(() => change('bob')); ui.rerender(view()); await tick();
    act(() => change('alice')); ui.rerender(view()); await tick();
    held.resolve(receipt(50)); await tick(5000);
    expect(screen.queryByText('50 Day Streak!')).not.toBeInTheDocument(); expect(screen.queryByText('Keep It Burning!')).not.toBeInTheDocument();
    expect(state.haptic).not.toHaveBeenCalled();
  });
  it('allows the next account its own confirmed popup and retires pending work on unmount', async () => {
    const held = deferred<ReturnType<typeof receipt>>();
    state.rpc.mockImplementation((name: string) => name === 'update_login_streak' ? held.promise : Promise.resolve(receipt()));
    const first = render(view()); await tick(); first.unmount(); held.resolve(receipt(9)); await tick(5000);
    expect(state.haptic).not.toHaveBeenCalled();
    act(() => change('bob')); state.rpc.mockResolvedValue(receipt(3)); render(view()); await tick(4000);
    expect(screen.getByText('3 Day Streak!')).toBeInTheDocument(); expect(state.haptic).toHaveBeenCalledTimes(1);
  });
});
