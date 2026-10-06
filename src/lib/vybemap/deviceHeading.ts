import { despiaCall, isDespiaRuntime, isIOSUA, getRuntimeOs } from '@/lib/despiaBridge';

/** Parse a compass heading (degrees from true/magnetic north) from DeviceOrientation. */
export function headingFromOrientationEvent(e: DeviceOrientationEvent): number | null {
  const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof webkit === 'number' && Number.isFinite(webkit)) {
    return ((webkit % 360) + 360) % 360;
  }

  const absolute = (e as DeviceOrientationEvent & { absolute?: boolean }).absolute;
  if (e.alpha != null && Number.isFinite(e.alpha) && (absolute === true || absolute == null)) {
    // CSS / map: 0 = north, clockwise. DeviceOrientation alpha is 0 = north counterclockwise on many browsers.
    return ((360 - e.alpha) % 360 + 360) % 360;
  }

  return null;
}

/** Apply screen-orientation offset so heading stays correct in landscape. */
export function applyScreenOrientationOffset(headingDeg: number): number {
  let angle = 0;
  try {
    const so = window.screen?.orientation?.angle;
    if (typeof so === 'number' && Number.isFinite(so)) angle = so;
    else if (typeof window.orientation === 'number') angle = window.orientation;
  } catch {
    /* ignore */
  }
  return ((headingDeg + angle) % 360 + 360) % 360;
}

let orientationPermissionPromised: Promise<boolean> | null = null;

/** Coalesce pending requests and remember grants, allowing failed requests to retry. */
export function ensureDeviceOrientationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return Promise.resolve(false);
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<PermissionState | string>;
  };
  if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true);
  if (!orientationPermissionPromised) {
    try {
      const pending = DOE.requestPermission().then(state => state === 'granted').catch(() => false);
      orientationPermissionPromised = pending;
      void pending.then(granted => {
        if (!granted && orientationPermissionPromised === pending) orientationPermissionPromised = null;
      });
    } catch { return Promise.resolve(false); }
  }
  return orientationPermissionPromised;
}

/** Reset cached permission promise (e.g. after user enables Settings). */
export function resetDeviceOrientationPermissionCache(): void {
  orientationPermissionPromised = null;
}

/** Low-pass toward target heading (shortest path). */
export function lerpHeading(current: number | null, target: number, alpha = 0.28): number {
  if (current == null || !Number.isFinite(current)) return target;
  const delta = ((target - current + 540) % 360) - 180;
  return ((current + delta * alpha) % 360 + 360) % 360;
}

export function shortestHeadingDelta(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

export type DeviceHeadingSource = 'despia' | 'web';

export type DeviceHeadingSample = {
  heading: number;
  source: DeviceHeadingSource;
  /** Degrees; lower is better. -1 unknown. */
  accuracy?: number;
};

type HeadingListener = (sample: DeviceHeadingSample) => void;

type GyroPayload = {
  status?: string;
  heading?: number;
  headingAccuracy?: number;
  x?: number;
  y?: number;
  z?: number;
  timestamp?: number;
};

const despiaListeners = new Set<HeadingListener>();
let despiaGyroStarted = false;
let installedGyroHandler: ((data: GyroPayload) => void) | null = null;
let prevOnGyroscopeChange: ((data: GyroPayload) => void) | null | undefined;

function normalizeHeadingDeg(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

function emitDespiaHeading(sample: DeviceHeadingSample) {
  despiaListeners.forEach((listener) => {
    try {
      listener(sample);
    } catch {
      /* ignore listener errors */
    }
  });
}

let despiaSmoothed: number | null = null;
let despiaLastEmit = 0;
let despiaLastEmittedHeading: number | null = null;

function onDespiaGyroscopeChange(data: GyroPayload) {
  if (!data || typeof data !== 'object') return;
  if (data.status === 'error') return;
  const heading = data.heading;
  if (typeof heading !== 'number' || !Number.isFinite(heading) || heading < 0) return;

  const raw = normalizeHeadingDeg(heading);
  // Gentle low-pass — canvas rAF does the visible ease (Google Maps feel).
  despiaSmoothed = lerpHeading(despiaSmoothed, raw, 0.22);
  const now = Date.now();
  const moved =
    despiaLastEmittedHeading == null ||
    Math.abs(shortestHeadingDelta(despiaSmoothed, despiaLastEmittedHeading)) >= 0.4;
  // Cap ~30 Hz to the JS bridge; map still lerps at 60fps.
  if (!moved && now - despiaLastEmit < 32) return;
  despiaLastEmit = now;
  despiaLastEmittedHeading = despiaSmoothed;

  emitDespiaHeading({
    heading: despiaSmoothed,
    source: 'despia',
    accuracy: typeof data.headingAccuracy === 'number' ? data.headingAccuracy : undefined,
  });
}

function ensureDespiaGyroStarted() {
  if (typeof window === 'undefined' || despiaGyroStarted) return;
  const w = window as Window & {
    onGyroscopeChange?: ((data: GyroPayload) => void) | null;
  };
  prevOnGyroscopeChange = w.onGyroscopeChange;
  const handler = (data: GyroPayload) => {
    if (installedGyroHandler !== handler || !despiaGyroStarted) return;
    onDespiaGyroscopeChange(data);
    if (typeof prevOnGyroscopeChange === 'function') {
      try {
        prevOnGyroscopeChange(data);
      } catch {
        /* ignore */
      }
    }
  };
  installedGyroHandler = handler;
  w.onGyroscopeChange = installedGyroHandler;
  despiaGyroStarted = true;
  // threshold=0 → every sample so heading stays live while gyro is quiet.
  // [iOS-only] Despia native gyro; Android/web use DeviceOrientation below.
  void despiaCall('gyroscope://start?threshold=0');
}

function stopDespiaGyroIfIdle() {
  if (despiaListeners.size > 0 || !despiaGyroStarted) return;
  despiaGyroStarted = false;
  void despiaCall('gyroscope://stop');
  const w = window as Window & {
    onGyroscopeChange?: ((data: GyroPayload) => void) | null;
  };
  if (installedGyroHandler && w.onGyroscopeChange === installedGyroHandler) {
    w.onGyroscopeChange = prevOnGyroscopeChange ?? null;
  }
  installedGyroHandler = null;
  prevOnGyroscopeChange = undefined;
  despiaSmoothed = null;
  despiaLastEmittedHeading = null;
}

function subscribeWebDeviceOrientation(listener: HeadingListener): () => void {
  let active = true;
  let smoothed: number | null = null;
  let lastEmit = 0;
  // [Android-only] Snappier filter + higher sample rate so Follow feels instant.
  const android = getRuntimeOs() === 'android';
  const alpha = android ? 0.45 : 0.28;
  const minIntervalMs = android ? 16 : 32;

  const onOrient = (e: DeviceOrientationEvent) => {
    if (!active) return;
    const raw = headingFromOrientationEvent(e);
    if (raw == null) return;
    const corrected = applyScreenOrientationOffset(raw);
    smoothed = lerpHeading(smoothed, corrected, alpha);
    const now = Date.now();
    if (now - lastEmit < minIntervalMs) return;
    lastEmit = now;
    listener({ heading: smoothed, source: 'web' });
  };

  const attach = () => { if (active) window.addEventListener('deviceorientation', onOrient, true); };
  const onGesture = () => {
    if (!active) return;
    void ensureDeviceOrientationPermission().then((ok) => {
      if (ok) attach();
    });
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('touchstart', onGesture, true);
  };

  void ensureDeviceOrientationPermission().then((ok) => {
    if (!active) return;
    if (ok) attach();
    else {
      window.addEventListener('pointerdown', onGesture, true);
      window.addEventListener('touchstart', onGesture, true);
    }
  });

  return () => {
    active = false;
    window.removeEventListener('deviceorientation', onOrient, true);
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('touchstart', onGesture, true);
  };
}

/**
 * Subscribe to live device heading.
 * [iOS-only] Despia: native gyroscope + magnetic compass (`window.onGyroscopeChange`).
 * [Android-only] + web: DeviceOrientationEvent (Android Despia has no reliable gyro bridge).
 */
export function subscribeDeviceHeading(listener: HeadingListener): () => void {
  if (typeof window === 'undefined') return () => {};

  // [iOS-only] Native Despia gyro — do NOT use this path on Android Despia.
  if (isDespiaRuntime() && isIOSUA()) {
    despiaListeners.add(listener);
    ensureDespiaGyroStarted();
    return () => {
      despiaListeners.delete(listener);
      stopDespiaGyroIfIdle();
    };
  }

  return subscribeWebDeviceOrientation(listener);
}

/** Native WebViews can remain document-visible after the app is backgrounded. */
export function subscribeForegroundDeviceHeading(listener: HeadingListener, onPause: () => void): () => void {
  let disposed = false, nativePaused = false, listening = false, generation = 0;
  let unsubscribe = () => {};
  const visible = () => !disposed && !nativePaused && document.visibilityState !== 'hidden';
  const update = () => {
    if (!visible()) {
      if (!listening) return;
      listening = false; generation++; unsubscribe(); onPause();
      return;
    }
    if (listening) return;
    listening = true;
    const current = ++generation;
    unsubscribe = subscribeDeviceHeading(sample => {
      if (visible() && listening && generation === current) listener(sample);
    });
  };
  const pause = () => { nativePaused = true; update(); };
  const resume = () => { nativePaused = false; update(); };
  document.addEventListener('visibilitychange', update);
  window.addEventListener('app-paused', pause);
  window.addEventListener('app-resumed', resume);
  update();
  return () => {
    disposed = true; generation++; unsubscribe();
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('app-paused', pause);
    window.removeEventListener('app-resumed', resume);
  };
}
