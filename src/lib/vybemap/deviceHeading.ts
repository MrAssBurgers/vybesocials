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

/** iOS requires a user gesture. Safe to call repeatedly; caches the attempt. */
export function ensureDeviceOrientationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<PermissionState | string>;
  };
  if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true);
  if (!orientationPermissionPromised) {
    orientationPermissionPromised = DOE.requestPermission()
      .then((state) => state === 'granted')
      .catch(() => false);
  }
  return orientationPermissionPromised;
}

/** Low-pass toward target heading (shortest path). */
export function lerpHeading(current: number | null, target: number, alpha = 0.28): number {
  if (current == null || !Number.isFinite(current)) return target;
  let delta = ((target - current + 540) % 360) - 180;
  return ((current + delta * alpha) % 360 + 360) % 360;
}
