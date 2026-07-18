const STORAGE_KEY = 'vybe-map-follow-heading-v1';

/** Default ON — Google Maps–style map rotation with phone heading. */
export function readMapFollowHeading(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === 'true';
  } catch {
    return true;
  }
}

export function persistMapFollowHeading(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}
