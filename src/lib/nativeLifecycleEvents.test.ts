import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installNativeLifecycleEvents } from './nativeLifecycleEvents';
let stop: () => void;
beforeEach(() => { stop = installNativeLifecycleEvents(); });
afterEach(() => stop());
it.each(['app-paused', 'app-resumed'])('delivers %s once for document, bubbling document and window dispatch', name => {
  const received = vi.fn(), documentReceived = vi.fn();
  window.addEventListener(name, received); document.addEventListener(name, documentReceived);
  try {
    const detail = { source: 'synthetic-native-qa' };
    document.dispatchEvent(new CustomEvent(name, { detail }));
    expect(received).toHaveBeenCalledOnce(); expect(documentReceived).toHaveBeenCalledOnce();
    expect(received.mock.calls[0][0].detail).toBe(detail);
    document.dispatchEvent(new CustomEvent(name, { bubbles: true }));
    expect(received).toHaveBeenCalledTimes(2); expect(documentReceived).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new CustomEvent(name));
    expect(received).toHaveBeenCalledTimes(3); expect(documentReceived).toHaveBeenCalledTimes(2);
  } finally { window.removeEventListener(name, received); document.removeEventListener(name, documentReceived); }
});
it('duplicate installation does not duplicate events or tear down the original installation', () => {
  const received = vi.fn(); window.addEventListener('app-resumed', received);
  try {
    const secondStop = installNativeLifecycleEvents(); secondStop();
    document.dispatchEvent(new CustomEvent('app-resumed')); expect(received).toHaveBeenCalledOnce();
    stop(); document.dispatchEvent(new CustomEvent('app-resumed')); expect(received).toHaveBeenCalledOnce();
    stop = installNativeLifecycleEvents(); document.dispatchEvent(new CustomEvent('app-resumed')); expect(received).toHaveBeenCalledTimes(2);
  } finally { window.removeEventListener('app-resumed', received); }
});
