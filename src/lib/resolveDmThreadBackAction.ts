/**
 * Pure priority resolver for DM thread back — unit-testable without React.
 * Returns which overlay to close, or 'leave' when nothing is open.
 */
export type DmBackOverlay =
  | 'mediaViewer'
  | 'sheet'
  | 'camera'
  | 'menu'
  | 'leave';

export interface DmBackOverlayState {
  mediaViewerOpen?: boolean;
  sheetOpen?: boolean;
  cameraOpen?: boolean;
  menuOpen?: boolean;
}

export function resolveDmThreadBackAction(state: DmBackOverlayState): DmBackOverlay {
  if (state.mediaViewerOpen) return 'mediaViewer';
  if (state.sheetOpen) return 'sheet';
  if (state.cameraOpen) return 'camera';
  if (state.menuOpen) return 'menu';
  return 'leave';
}
