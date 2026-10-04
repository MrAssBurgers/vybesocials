import { MINI_APP_CATEGORIES, MINI_APP_CODE_LIMIT, type MiniAppSource } from './model';

// JSON can expand one UTF-16 code unit into six characters (e.g. \u0000).
// Include bounded metadata and envelope overhead in the same read/write limit.
const SERIALIZED_LIMIT = 6 * (MINI_APP_CODE_LIMIT + 60 + 240) + 2048;
function recoverySource(value: unknown): MiniAppSource | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { title, description, category, html, css, javascript } = value as MiniAppSource;
  if (![title, description, category, html, css, javascript].every(field => typeof field === 'string')
    || title.length > 60 || description.length > 240 || !MINI_APP_CATEGORIES.includes(category)
    || html.length + css.length + javascript.length > MINI_APP_CODE_LIMIT) return null;
  // Unfinished code and blank titles are valid recovery data, not publishable apps.
  return { title, description, category, html, css, javascript };
}
function recoveryId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w-]{1,128}$/.test(value) ? value : undefined;
}

function key(ownerId: string, draftId?: string) { return `vybe.mini-app.recovery.${ownerId}.${draftId || 'new'}`; }

export function readMiniAppRecoveryEntry(ownerId: string, draftId?: string): { source: MiniAppSource; pendingId?: string } | null {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(key(ownerId, draftId));
    if (!raw || raw.length > SERIALIZED_LIMIT) return null;
    const { source, savedAt, pendingId } = JSON.parse(raw);
    if (!Number.isFinite(savedAt) || savedAt > Date.now() || Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) return null;
    const valid = recoverySource(source);
    return valid ? { source: valid, pendingId: recoveryId(pendingId) } : null;
  } catch { return null; }
}

export function readMiniAppRecovery(ownerId: string, draftId?: string): MiniAppSource | null { return readMiniAppRecoveryEntry(ownerId, draftId)?.source || null; }

export function saveMiniAppRecovery(ownerId: string, source: MiniAppSource, draftId?: string, pendingId?: string): boolean {
  if (!ownerId) return false;
  try {
    const valid = recoverySource(source);
    if (!valid) return false;
    const raw = JSON.stringify({ source: valid, pendingId: recoveryId(pendingId), savedAt: Date.now() });
    if (raw.length > SERIALIZED_LIMIT) return false;
    localStorage.setItem(key(ownerId, draftId), raw);
    return true;
  }
  catch { return false; }
}

export function clearMiniAppRecovery(ownerId: string, draftId?: string) {
  try { localStorage.removeItem(key(ownerId, draftId)); } catch { /* Storage may be unavailable. */ }
}
