import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NotificationActionRouter, ingestNotificationFromBridge } from './NotificationActionRouter';
import { registerPendingNotificationFlusher } from '@/lib/pendingNotificationQueue';

const mocks = vi.hoisted(() => ({ authReady: false, navigate: vi.fn(), acceptCall: vi.fn(), dismissIncoming: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ authReady: mocks.authReady }) }));
vi.mock('@/lib/callStore', () => ({ useCallStore: () => ({ acceptCall: mocks.acceptCall, dismissIncoming: mocks.dismissIncoming }) }));
vi.mock('@/lib/nativeIncomingCall', () => ({ presentNativeIncomingCall: vi.fn() }));
vi.mock('@/lib/notificationActions', () => ({
  normalizeNotificationPayload: (payload: unknown) => payload && typeof payload === 'object' ? { action: 'open', ...payload } : null,
  buildNotificationRoute: (payload: { conversationId?: string }) => `/messages/${payload.conversationId}`,
  navigateFromNotification: mocks.navigate,
  declineCallById: vi.fn(), fetchRingingCall: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const view = () => <MemoryRouter><NotificationActionRouter /></MemoryRouter>;
beforeEach(() => {
  mocks.authReady = false;
  vi.clearAllMocks();
  // Empty any previous test queue without retaining a registered consumer.
  registerPendingNotificationFlusher(() => {})();
  (window as Window & { OneSignalDeferred?: unknown[] }).OneSignalDeferred = [];
});
afterEach(cleanup);

describe('notification actions wait for authentication readiness', () => {
  it('retains cold-start native notifications until auth becomes ready', () => {
    ingestNotificationFromBridge({ type: 'message', conversationId: 'cold-start' });
    const rendered = render(view());
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.authReady = true;
    rendered.rerender(view());
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/messages/cold-start');
    rendered.rerender(view());
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
  it('queues notifications received after mount while auth is still loading', () => {
    const rendered = render(view());
    act(() => { window.dispatchEvent(new CustomEvent('vybe:notification-action', { detail: { type: 'message', conversationId: 'after-mount' } })); });
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.authReady = true;
    rendered.rerender(view());
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/messages/after-mount');
  });
  it('removes the consumer if readiness is revoked and drains after recovery', () => {
    mocks.authReady = true;
    const rendered = render(view());
    mocks.authReady = false;
    rendered.rerender(view());
    act(() => ingestNotificationFromBridge({ type: 'message', conversationId: 'recovered' }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.authReady = true;
    rendered.rerender(view());
    expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('/messages/recovered');
  });
});
