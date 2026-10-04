import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { haptics, setHapticsEnabled } from './haptics';
import { triggerNavFeedback } from './navFeedback';

vi.mock('despia-native', () => ({ default: vi.fn() }));
vi.mock('./premiumSounds', () => ({ getSoundSettings: () => ({ master: false }), premiumSounds: { tap: vi.fn() } }));
const vibrate = vi.fn();
let now = 0;
beforeEach(() => {
  vi.stubGlobal('navigator', { vibrate, userAgent: 'web' });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  setHapticsEnabled(false); setHapticsEnabled(true); vibrate.mockClear();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('navigation shares the haptic mute preference', () => {
  setHapticsEnabled(false); vibrate.mockClear();
  triggerNavFeedback(); haptics.like();
  expect(vibrate).not.toHaveBeenCalled();
  setHapticsEnabled(true); triggerNavFeedback();
  expect(vibrate).toHaveBeenCalledWith(10);
});
it('coalesces a nested duplicate tap without swallowing the next gesture', () => {
  haptics.tap(); haptics.like();
  expect(vibrate).toHaveBeenCalledTimes(1);
  now += 80; haptics.tap();
  expect(vibrate).toHaveBeenCalledTimes(2);
});
it('cancels an active web vibration when disabled locally or in another tab', () => {
  haptics.error(); setHapticsEnabled(false);
  expect(vibrate).toHaveBeenLastCalledWith(0);
  setHapticsEnabled(true); now += 100; haptics.success();
  localStorage.setItem('vybe-haptics-enabled', 'false');
  window.dispatchEvent(new StorageEvent('storage', { key: 'vybe-haptics-enabled' }));
  expect(vibrate).toHaveBeenLastCalledWith(0);
});
