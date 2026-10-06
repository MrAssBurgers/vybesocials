import { afterEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ listeners: new Map<string, (value: { isActive: boolean }) => void>() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn((name, callback) => native.listeners.set(name, callback)) } }));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { setStyle: vi.fn(), setOverlaysWebView: vi.fn() }, Style: { Dark: 'DARK' } }));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn() } }));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: vi.fn() } }));
import { initializeNativePlugins } from './capacitor';
afterEach(() => native.listeners.clear());
it('delivers each native lifecycle event once to both document and window consumers', async () => {
  const documentResume = vi.fn(), windowResume = vi.fn(), windowPause = vi.fn();
  document.addEventListener('app-resumed', documentResume);
  window.addEventListener('app-resumed', windowResume);
  window.addEventListener('app-paused', windowPause);
  try {
    await initializeNativePlugins();
    native.listeners.get('appStateChange')!({ isActive: false });
    native.listeners.get('appStateChange')!({ isActive: true });
    expect(documentResume).toHaveBeenCalledOnce(); expect(windowResume).toHaveBeenCalledOnce(); expect(windowPause).toHaveBeenCalledOnce();
  } finally {
    document.removeEventListener('app-resumed', documentResume);
    window.removeEventListener('app-resumed', windowResume);
    window.removeEventListener('app-paused', windowPause);
  }
});
