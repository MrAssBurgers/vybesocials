import { MINI_APP_CATEGORIES, MINI_APP_CODE_LIMIT, type MiniAppSource } from './model';

function key(ownerId: string, draftId?: string) { return `vybe.mini-app.recovery.${ownerId}.${draftId || 'new'}`; }

export function readMiniAppRecovery(ownerId: string, draftId?: string): MiniAppSource | null {
  if (!ownerId) return null;
  try {
    const raw = localStorage.getItem(key(ownerId, draftId));
    if (!raw || raw.length > MINI_APP_CODE_LIMIT * 2 + 2000) return null;
    const { source, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) return null;
    if (!source || !['title', 'description', 'html', 'css', 'javascript'].every(field => typeof source[field] === 'string')) return null;
    if (!MINI_APP_CATEGORIES.includes(source.category) || source.html.length + source.css.length + source.javascript.length > MINI_APP_CODE_LIMIT) return null;
    return source as MiniAppSource;
  } catch { return null; }
}

export function saveMiniAppRecovery(ownerId: string, source: MiniAppSource, draftId?: string): boolean {
  if (!ownerId || source.html.length + source.css.length + source.javascript.length > MINI_APP_CODE_LIMIT) return false;
  try { localStorage.setItem(key(ownerId, draftId), JSON.stringify({ source, savedAt: Date.now() })); return true; }
  catch { return false; }
}

export function clearMiniAppRecovery(ownerId: string, draftId?: string) {
  try { localStorage.removeItem(key(ownerId, draftId)); } catch { /* Storage may be unavailable. */ }
}
