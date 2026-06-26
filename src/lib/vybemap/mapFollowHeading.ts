const STORAGE_KEY = 'vybe-map-follow-heading-v1';

export function readMapFollowHeading(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function persistMapFollowHeading(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    /* ignore */
  }
}
