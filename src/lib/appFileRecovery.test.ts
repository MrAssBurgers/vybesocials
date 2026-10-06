import { afterEach, describe, expect, it, vi } from 'vitest';
const clear = vi.hoisted(() => vi.fn());
vi.mock('./selfHealingMonitor', () => ({ clearAppCache: clear }));
import { clearOwnedAppFiles } from './appFileRecovery';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('update file recovery', () => {
  it('retires only the same-origin root Vybe worker and delegates bounded file cleanup', async () => {
    const registration = (scriptURL: string, scope = window.location.origin + '/') => ({ active: {scriptURL}, scope, unregister: vi.fn(async () => true) });
    const own = registration(window.location.origin + '/sw.js?version=43');
    const others = [registration(window.location.origin + '/push/sw.js'), registration(window.location.origin + '/sw.js', window.location.origin + '/other/'), registration('https://other.test/sw.js'), registration(window.location.origin + '/firebase-messaging-sw.js')];
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    Object.defineProperty(navigator, 'serviceWorker', {configurable:true,value:{getRegistrations:vi.fn(async()=>[own,...others])}});
    await clearOwnedAppFiles(); expect(own.unregister).toHaveBeenCalledOnce();
    for (const other of others) expect(other.unregister).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalledOnce(); delete (navigator as unknown as {serviceWorker?:unknown}).serviceWorker;
  });
  it('keeps the last usable offline shell instead of deleting it', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await clearOwnedAppFiles(); expect(clear).not.toHaveBeenCalled();
  });
});
