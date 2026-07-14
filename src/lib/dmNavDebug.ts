/**
 * Dev-only DM navigation debug — enable with:
 *   localStorage.setItem('vybe-dm-nav-debug', '1')
 * Then reload. Logs elementFromPoint and overlay flags on clicks inside DMs.
 */
const FLAG = 'vybe-dm-nav-debug';

export function isDmNavDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export function logDmNavDebug(
  label: string,
  extra?: Record<string, unknown>,
  point?: { x: number; y: number },
): void {
  if (!isDmNavDebugEnabled()) return;
  const x = point?.x ?? window.innerWidth / 2;
  const y = point?.y ?? window.innerHeight / 2;
  const el = document.elementFromPoint(x, y);
  const captureEl =
    typeof (document as Document & { pointerLockElement?: Element | null }).pointerLockElement !==
    'undefined'
      ? document.pointerLockElement
      : null;
  // eslint-disable-next-line no-console
  console.info('[vybe-dm-nav-debug]', label, {
    underPoint: el
      ? {
          tag: el.tagName,
          id: el.id,
          className: typeof el.className === 'string' ? el.className.slice(0, 120) : '',
        }
      : null,
    route: window.location.pathname,
    dataDmActive: document.documentElement.getAttribute('data-dm-active'),
    dataCameraOpen: document.documentElement.getAttribute('data-camera-open'),
    bodyOverflow: document.body.style.overflow,
    pointerLock: captureEl?.id || captureEl?.tagName || null,
    ...extra,
  });
}

/** Attach a capturing click logger while on DM routes (call once from ChatView). */
export function attachDmNavClickDebug(): () => void {
  if (!isDmNavDebugEnabled()) return () => {};
  const onClick = (e: MouseEvent) => {
    logDmNavDebug('click', { target: (e.target as Element | null)?.tagName }, { x: e.clientX, y: e.clientY });
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
