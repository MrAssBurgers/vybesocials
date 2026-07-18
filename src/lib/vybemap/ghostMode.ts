/** Local prefs for VybeMap Ghost Mode (hide live location from friends). */

export const SHARING_PREF_KEY = 'vybe-map-sharing';
/** Epoch ms when temporary ghost ends. Absent = permanent ghost or live. */
export const GHOST_UNTIL_KEY = 'vybe-map-ghost-until';

export function readSharingPref(): boolean {
  try {
    const stored = localStorage.getItem(SHARING_PREF_KEY);
    // Default visible — users opt into Ghost Mode.
    if (stored === null) return true;
    return stored === 'true';
  } catch {
    return true;
  }
}

export function persistSharingPref(sharing: boolean): void {
  try {
    localStorage.setItem(SHARING_PREF_KEY, String(sharing));
  } catch {
    /* ignore */
  }
}

export function readGhostUntil(): number | null {
  try {
    const raw = localStorage.getItem(GHOST_UNTIL_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function persistGhostUntil(untilMs: number | null): void {
  try {
    if (untilMs == null) localStorage.removeItem(GHOST_UNTIL_KEY);
    else localStorage.setItem(GHOST_UNTIL_KEY, String(untilMs));
  } catch {
    /* ignore */
  }
}

/**
 * Resolve sharing on boot / map open.
 * Temporary ghosts that expired (or timers lost on navigation) auto-restore to live.
 * Permanent ghost (sharing=false, no until) stays ghost until the user exits.
 */
export function resolveSharingOnLoad(): { sharing: boolean; ghostUntil: number | null } {
  const until = readGhostUntil();
  const now = Date.now();

  if (until != null) {
    if (until <= now) {
      persistGhostUntil(null);
      persistSharingPref(true);
      return { sharing: true, ghostUntil: null };
    }
    // Still in temporary ghost window.
    persistSharingPref(false);
    return { sharing: false, ghostUntil: until };
  }

  return { sharing: readSharingPref(), ghostUntil: null };
}
