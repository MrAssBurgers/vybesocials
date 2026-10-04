import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, sender: vi.fn(), conversation: vi.fn(), toast: vi.fn(), sound: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: table === 'profiles' ? state.sender : state.conversation }) }) }) } }));
vi.mock('@/lib/premiumSounds', () => ({ premiumSounds: { notification: state.sound } }));
vi.mock('@/components/notifications/MessageNotificationToast', () => ({ showMessageNotification: state.toast }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => false }));
vi.mock('@/lib/capacitor', () => ({ isNativePlatform: false }));
vi.mock('@/lib/inAppNotificationDedupe', () => ({ dmNotificationTag: () => 'tag', shouldShowInAppNotification: () => true }));
import { maybeShowForegroundDmNotification } from './foregroundDmNotification';
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };
const options = () => ({ message: { id: 'm', conversation_id: 'room', sender_id: 'bob', content: 'Private message', created_at: new Date().toISOString() }, profileId: 'alice-profile', isViewingConvo: false, queryClient: new QueryClient(), accountSession: { ...state.session } });
beforeEach(() => { state.session = { uid: 'alice', epoch: 1 }; state.sender.mockReset().mockResolvedValue({ data: { username: 'bob' } }); state.conversation.mockReset().mockResolvedValue({ data: { is_group: false } }); state.toast.mockReset(); state.sound.mockReset(); });
afterEach(() => vi.restoreAllMocks());

describe('private foreground notifications retain their initiating session', () => {
  it('shows a fresh authorized message', async () => {
    const input = options(); await maybeShowForegroundDmNotification(input);
    expect(state.toast).toHaveBeenCalledOnce(); expect(state.sound).toHaveBeenCalledOnce(); input.queryClient.clear();
  });
  it.each(['sender', 'conversation'] as const)('suppresses private text after an account switch during %s lookup', async lookup => {
    const reply = deferred<{ data: Record<string, unknown> }>(); state[lookup].mockReturnValue(reply.promise);
    const input = options(); const pending = maybeShowForegroundDmNotification(input);
    await Promise.resolve(); state.session = { uid: 'bob', epoch: 2 }; reply.resolve({ data: { username: 'bob' } }); await pending;
    expect(state.toast).not.toHaveBeenCalled(); expect(state.sound).not.toHaveBeenCalled(); input.queryClient.clear();
  });
  it('suppresses a logout/login ABA completion even when the UID matches again', async () => {
    const reply = deferred<{ data: Record<string, unknown> }>(); state.sender.mockReturnValue(reply.promise);
    const input = options(); const pending = maybeShowForegroundDmNotification(input);
    state.session = { uid: 'alice', epoch: 3 }; reply.resolve({ data: { username: 'bob' } }); await pending;
    expect(state.toast).not.toHaveBeenCalled(); input.queryClient.clear();
  });
  it('honors listener teardown after async lookup', async () => {
    const reply = deferred<{ data: Record<string, unknown> }>(); state.sender.mockReturnValue(reply.promise);
    let active = true; const input = options(); const pending = maybeShowForegroundDmNotification({ ...input, isCurrent: () => active });
    active = false; reply.resolve({ data: { username: 'bob' } }); await pending;
    expect(state.toast).not.toHaveBeenCalled(); input.queryClient.clear();
  });
  it('does not post a system notification after service-worker readiness crosses accounts', async () => {
    const worker = deferred<{ showNotification: ReturnType<typeof vi.fn> }>(); const showNotification = vi.fn();
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {}, ready: worker.promise } });
    const input = options(); const pending = maybeShowForegroundDmNotification(input);
    for (let n = 0; n < 6; n++) await Promise.resolve();
    state.session = { uid: 'bob', epoch: 2 }; worker.resolve({ showNotification }); await pending;
    expect(showNotification).not.toHaveBeenCalled(); input.queryClient.clear();
    vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});
