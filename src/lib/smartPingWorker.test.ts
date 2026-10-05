// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
function worker(open = true) {
  const handlers = new Map<string, (event: unknown) => void>();
  const show = vi.fn().mockResolvedValue(undefined), post = vi.fn(), openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(source, { self: { addEventListener: (type: string, callback: (event: unknown) => void) => handlers.set(type, callback), navigator: { userAgent: 'Android' }, registration: { showNotification: show } }, clients: { matchAll: async () => open ? [{ postMessage: post }] : [], openWindow }, console: { log: () => {}, warn: () => {}, error: () => {} } });
  return { handlers, show, post, openWindow };
}
it('preserves the server recipient across push display and the deliberate Mute 1h click', async () => {
  const current = worker(); let work!: Promise<unknown>;
  current.handlers.get('push')!({ data: { json: () => ({ type: 'smart_ping', title: 'Synthetic ping', recipientUid: 'alice' }) }, waitUntil: (pending: Promise<unknown>) => { work = pending; } }); await work;
  const options = current.show.mock.calls[0][1]; expect(options.data.recipientUid).toBe('alice');
  current.handlers.get('notificationclick')!({ action: 'mute1h', notification: { data: options.data, close: vi.fn() }, waitUntil: (pending: Promise<unknown>) => { work = pending; } }); await work;
  expect(current.post).toHaveBeenCalledWith({ type: 'MUTE_SMART_PINGS', hours: 1, recipientUid: 'alice' });
});
it('opens notification settings when no app client can process the action', async () => {
  const current = worker(false); let work!: Promise<unknown>;
  current.handlers.get('notificationclick')!({ action: 'mute1h', notification: { data: { type: 'smart_ping' }, close: vi.fn() }, waitUntil: (pending: Promise<unknown>) => { work = pending; } }); await work;
  expect(current.post).not.toHaveBeenCalled(); expect(current.openWindow).toHaveBeenCalledWith('/settings?tab=notifications');
});
