/**
 * Safari / WKWebView often lack requestIdleCallback. Some browsers polyfill
 * requestIdleCallback without cancelIdleCallback — bare cancelIdleCallback then
 * throws "Can't find variable: cancelIdleCallback" and crashes DM mount.
 * Install both before any app module schedules idle work.
 */

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCb = (deadline: IdleDeadlineLike) => void;

export function installIdleCallbackPolyfill(): void {
  if (typeof window === 'undefined') return;

  const w = window as Window & {
    requestIdleCallback?: (cb: IdleCb, opts?: { timeout?: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof w.requestIdleCallback !== 'function') {
    w.requestIdleCallback = (cb, options) => {
      const start = Date.now();
      return window.setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
      }, options?.timeout ?? 1) as unknown as number;
    };
  }

  if (typeof w.cancelIdleCallback !== 'function') {
    w.cancelIdleCallback = (id: number) => {
      window.clearTimeout(id);
    };
  }
}

installIdleCallbackPolyfill();
