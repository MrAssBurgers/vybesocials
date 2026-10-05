import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'alice' } as { id: string } | null, nativeUser: { uid: 'alice', metadata: { creationTime: new Date(1700000000000).toUTCString() } } as any, profile: { id: 'profile-alice', user_id: 'alice', onboarding_completed: true } as any, session: { uid: 'alice' as string | undefined, epoch: 1 }, listeners: new Set<() => void>(), rpc: vi.fn(), haptic: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.nativeUser }) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: async (_name: string, input: any) => {
  const result = await state.rpc(input.action, { expectedRevision: input.expectedRevision });
  return { data: { ...result, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, accountCreatedAt: input.expectedAccountCreatedAt, action: input.action, requestId: input.requestId ?? null }, error: null };
} }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: true }) }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => state.session,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (!uid || state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); }; },
}));
vi.mock('@/hooks/usePremiumStatus', () => ({ usePremiumStatus: () => ({ isPremium: true }) }));
vi.mock('@/lib/haptics', () => ({ haptics: { success: state.haptic } }));
vi.mock('sonner', () => ({ toast: { success: state.toast, error: state.toast } }));
import { StreakProvider } from './StreakProvider';
import { streakReceipt } from '@/test/loginStreakFixture';
import { StrictMode } from 'react';
const receipt = (streak = 1, extended = true) => streakReceipt({ streak, longestStreak: streak, isNewDay: extended, streakExtended: extended });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
let client: QueryClient;
const view = () => <QueryClientProvider client={client}><StreakProvider><p>Current page</p><button>Page action</button></StreakProvider></QueryClientProvider>;
function change(uid?: string) {
  state.session = { uid, epoch: state.session.epoch + 1 };
  state.user = uid ? { id: uid } : null;
  state.nativeUser = uid ? { uid, metadata: { creationTime: new Date(1700000000000).toUTCString() } } : null;
  state.profile = uid ? { id: `profile-${uid}`, user_id: uid, onboarding_completed: true } : null;
  for (const listener of state.listeners) listener();
}
const tick = (ms = 0) => act(async () => { await vi.dynamicImportSettled(); await vi.advanceTimersByTimeAsync(ms); await vi.advanceTimersByTimeAsync(0); });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T10:00:00Z')); vi.clearAllMocks(); change('alice'); state.listeners.clear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, gcTime: 14 * 86400000, refetchOnMount: false } } });
  state.rpc.mockResolvedValue(receipt());
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });
describe('streak overlay retirement', () => {
  it('tracks after StrictMode remount without retiring the only initial attempt', async () => {
    render(<StrictMode>{view()}</StrictMode>); await tick(4000); expect(screen.getByText('1 Day Streak!')).toBeInTheDocument();
  });
  it('checks the next server day on foreground, attempts it once, and leaves failures for explicit retry', async () => {
    let day = '2026-10-05', tracked = true, tracks = 0;
    state.rpc.mockImplementation((action: string) => {
      if (action === 'track') { tracks++; if (tracks === 2) return Promise.reject(new Error('Offline')); tracked = true; }
      return Promise.resolve(streakReceipt({ currentDay: day, isNewDay: action === 'track', streakExtended: action === 'track', needsLoginToday: !tracked }));
    });
    render(view()); await tick(4000); fireEvent.click(screen.getByRole('button', { name: 'Keep It Burning!' })); await tick();
    day = '2026-10-06'; tracked = false; vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); fireEvent(document, new Event('visibilitychange')); await tick(60000); expect(tracks).toBe(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); fireEvent(document, new Event('visibilitychange')); await tick(); await tick();
    expect(tracks).toBe(2); expect(screen.getByText('Streak unavailable')).toBeInTheDocument();
    fireEvent(window, new Event('focus')); await tick(60000); expect(tracks).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh streak' })); await tick(); expect(tracks).toBe(3); expect(screen.getByText('1 Day Streak!')).toBeInTheDocument();
  });
  it('checks a kept-open foreground session each minute and records a newly observed server day', async () => {
    let day = '2026-10-05', tracks = 0;
    state.rpc.mockImplementation((action: string) => { if (action === 'track') tracks++; return Promise.resolve(streakReceipt({ currentDay: day, needsLoginToday: day === '2026-10-06' && tracks < 2, isNewDay: action === 'track' })); });
    render(view()); await tick(4000); expect(tracks).toBe(1); day = '2026-10-06'; await tick(60000); await tick(); expect(tracks).toBe(2);
  });
  it('explains the one-day policy and retires the restore button when its actual deadline passes', async () => {
    state.rpc.mockResolvedValue(streakReceipt({ isNewDay: true, streakBroken: true, longestStreak: 9, restore: { eligible: true, previousStreak: 3, availableUntil: new Date(Date.now() + 6000).toISOString(), access: 'launch-free', reason: 'available' } }));
    render(view()); await tick(4000); expect(screen.getByText(/exactly one missed day/)).toHaveTextContent('(UTC)'); expect(screen.getByRole('button', { name: 'Restore 3-day run' })).toBeInTheDocument();
    await tick(3000); expect(screen.queryByRole('button', { name: /Restore 3/ })).not.toBeInTheDocument(); expect(screen.getByRole('status')).toHaveTextContent('restore window has ended');
  });
  it('traps keyboard focus, closes on Escape and returns focus without motion when reduced motion is enabled', async () => {
    render(view()); const trigger = screen.getByRole('button', { name: 'Page action' }); trigger.focus(); await tick(4000);
    const dialog = screen.getByRole('dialog'); expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const close = screen.getByRole('button', { name: 'Close' }); close.focus(); fireEvent.keyDown(close, { key: 'Tab', code: 'Tab' });
    expect(screen.getByRole('button', { name: 'Keep It Burning!' })).toHaveFocus();
    expect(screen.getByText('🔥')).toHaveStyle({ transform: 'none' });
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' }); await tick(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it('closing while restore is pending prevents a late receipt from reopening or celebrating', async () => {
    const broken = streakReceipt({ isNewDay: true, streakBroken: true, longestStreak: 10, restore: { eligible: true, previousStreak: 3, availableUntil: '2026-10-06T00:00:00Z', access: 'launch-free', reason: 'available' } });
    const held = deferred<ReturnType<typeof receipt>>(); state.rpc.mockImplementation((action: string) => action === 'restore' ? held.promise : Promise.resolve(broken));
    render(view()); await tick(4000); const button = screen.getByRole('button', { name: 'Restore 3-day run' });
    fireEvent.click(button); fireEvent.click(button); await tick(); expect(state.rpc.mock.calls.filter(([action]) => action === 'restore')).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); await tick(); held.resolve(streakReceipt({ restored: true, streak: 4, longestStreak: 10 })); await tick();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(state.haptic).not.toHaveBeenCalled();
  });
  it('keeps historical best visible without offering an unverified restore or Pro promise', async () => {
    state.rpc.mockResolvedValue(streakReceipt({ isNewDay: true, streakBroken: true, longestStreak: 90, legacyHistory: { status: 'preserved', currentStreak: 7, longestStreak: 90, lastLoginDate: '2026-10-03' }, restore: { eligible: false, previousStreak: null, availableUntil: null, access: 'launch-free', reason: 'legacy-unverified' } }));
    render(view()); await tick(4000); expect(screen.getByText('90')).toBeInTheDocument(); expect(screen.getByText(/cannot be verified for a restore/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument(); expect(screen.queryByText(/Pro perk/)).not.toBeInTheDocument();
  });
  it('makes the broken-streak restore reachable with the actual prior run and confirmed success', async () => {
    const broken = streakReceipt({ isNewDay: true, streakBroken: true, streak: 1, longestStreak: 90, restore: { eligible: true, previousStreak: 7, availableUntil: '2026-10-06T00:00:00Z', access: 'launch-free', reason: 'available' } });
    const held = deferred<ReturnType<typeof receipt>>();
    state.rpc.mockImplementation((action: string) => action === 'restore' ? held.promise : Promise.resolve(broken));
    render(view()); await tick(4000);
    expect(client.getMutationCache().getAll().map(item => item.state.error)).toEqual([null]);
    expect(screen.getByRole('dialog', { name: 'A new streak started' })).toBeInTheDocument();
    expect(screen.queryByText(/Restore 90/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore 7-day run' })); await tick();
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();
    expect(state.rpc).toHaveBeenCalledWith('restore', { expectedRevision: 'a'.repeat(48) });
    held.resolve(streakReceipt({ action: 'restore', restored: true, streak: 8, longestStreak: 90 })); await tick();
    expect(screen.getByRole('dialog', { name: 'Streak restored!' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restore 7/ })).not.toBeInTheDocument();
  });
  it('keeps failed restore open, preserves the previous-run offer and retries without false celebration', async () => {
    const broken = streakReceipt({ isNewDay: true, streakBroken: true, longestStreak: 10, restore: { eligible: true, previousStreak: 3, availableUntil: '2026-10-06T00:00:00Z', access: 'launch-free', reason: 'available' } });
    let restores = 0;
    state.rpc.mockImplementation((action: string) => action === 'restore' ? (++restores === 1 ? Promise.reject(new Error('Offline')) : Promise.resolve(streakReceipt({ restored: true, streak: 4, longestStreak: 10 }))) : Promise.resolve(broken));
    render(view()); await tick(4000); fireEvent.click(screen.getByRole('button', { name: 'Restore 3-day run' })); await tick();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be confirmed'); expect(state.haptic).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore 3-day run' })); await tick();
    expect(screen.getByText('Streak restored!')).toBeInTheDocument(); expect(state.haptic).toHaveBeenCalledTimes(1);
  });
  it('shows failed tracking truthfully and permits a confirmed retry', async () => {
    let tracks = 0; state.rpc.mockImplementation((action: string) => action === 'track' && ++tracks === 1 ? Promise.reject(new Error('Offline')) : Promise.resolve(receipt()));
    render(view()); await tick(4000); expect(screen.getByRole('dialog', { name: 'Streak unavailable' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh streak' })); await tick(); expect(screen.getByText('1 Day Streak!')).toBeInTheDocument();
  });
  it('does not show a delayed login receipt on the signed-out landing page', async () => {
    const held = deferred<ReturnType<typeof receipt>>();
    state.rpc.mockImplementation((name: string) => name === 'track' ? held.promise : Promise.resolve(receipt()));
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
    state.rpc.mockImplementation((name: string) => name === 'track' && ++updates === 1 ? held.promise : Promise.resolve(receipt(2, false)));
    const ui = render(view()); await tick();
    act(() => change('bob')); ui.rerender(view()); await tick();
    act(() => change('alice')); ui.rerender(view()); await tick();
    held.resolve(receipt(50)); await tick(5000);
    expect(screen.queryByText('50 Day Streak!')).not.toBeInTheDocument(); expect(screen.queryByText('Keep It Burning!')).not.toBeInTheDocument();
    expect(state.haptic).not.toHaveBeenCalled();
  });
  it('allows the next account its own confirmed popup and retires pending work on unmount', async () => {
    const held = deferred<ReturnType<typeof receipt>>();
    state.rpc.mockImplementation((name: string) => name === 'track' ? held.promise : Promise.resolve(receipt()));
    const first = render(view()); await tick(); first.unmount(); held.resolve(receipt(9)); await tick(5000);
    expect(state.haptic).not.toHaveBeenCalled();
    act(() => change('bob')); state.rpc.mockResolvedValue(receipt(3)); render(view()); await tick(4000);
    expect(screen.getByText('3 Day Streak!')).toBeInTheDocument(); expect(state.haptic).toHaveBeenCalledTimes(1);
  });
});
