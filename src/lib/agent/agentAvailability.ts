const UNAVAILABLE_KEY = 'vybe-agent-unavailable-until';
const DEFAULT_TTL_MS = 60 * 60_000;

export function markAgentUnavailable(ttlMs = DEFAULT_TTL_MS): void {
  try {
    sessionStorage.setItem(UNAVAILABLE_KEY, String(Date.now() + ttlMs));
  } catch {
    /* ignore */
  }
}

export function isAgentMarkedUnavailable(): boolean {
  try {
    const raw = sessionStorage.getItem(UNAVAILABLE_KEY);
    if (!raw) return false;
    if (Date.now() >= Number(raw)) {
      sessionStorage.removeItem(UNAVAILABLE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearAgentUnavailableMark(): void {
  try {
    sessionStorage.removeItem(UNAVAILABLE_KEY);
  } catch {
    /* ignore */
  }
}
