/** Dispatched to close message-level media viewers / context menus before leave. */
export const DM_CLOSE_OVERLAYS_EVENT = 'vybe-dm-close-overlays';

export type DmCloseOverlaysDetail = { closed: boolean };

export function dispatchDmCloseOverlays(): boolean {
  if (typeof window === 'undefined') return false;
  const detail: DmCloseOverlaysDetail = { closed: false };
  window.dispatchEvent(new CustomEvent(DM_CLOSE_OVERLAYS_EVENT, { detail }));
  return detail.closed;
}
