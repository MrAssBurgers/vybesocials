import { getDocumentFromServer, getDocumentsFromServer, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import type { SharedTheme } from '@/hooks/useSharedThemes';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

type Row = Record<string, unknown>;
type ReadOptions = { signal?: AbortSignal };
export type SavedTheme = SharedTheme & { saved_id: string };
export interface SavedThemeCollection {
  themes: SavedTheme[];
  unavailableCount: number;
}

function checkRead(options?: ReadOptions) {
  if (options?.signal?.aborted) throw new DOMException('Theme request cancelled', 'AbortError');
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
}

function unavailable(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code).replace(/^firestore\//, '') : '';
  return code === 'permission-denied' || code === 'not-found';
}

export function normalizeSharedTheme(row: Row, id: string): SharedTheme | null {
  const tokens = row.theme_tokens;
  if (!validId(row.creator_id) || !tokens || typeof tokens !== 'object' || Array.isArray(tokens)
    || typeof (tokens as Row).colorPrimary !== 'string' || !(tokens as Row).colorPrimary) return null;
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return {
    id, creator_id: row.creator_id,
    theme_name: typeof row.theme_name === 'string' ? row.theme_name : 'Untitled theme',
    theme_tokens: { ...tokens, mode: (tokens as Row).mode === 'light' ? 'light' : 'dark' } as ThemeTokens,
    layout_settings: row.layout_settings && typeof row.layout_settings === 'object' && !Array.isArray(row.layout_settings) ? row.layout_settings : null,
    description: typeof row.description === 'string' ? row.description : null,
    likes_count: count(row.likes_count), downloads_count: count(row.downloads_count),
    is_public: row.is_public === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : null,
    category: typeof row.category === 'string' ? row.category : null,
  };
}

/** Direct reads enforce current Firestore visibility; there is no privileged link bypass. */
export async function loadSharedTheme(id: string, options?: ReadOptions): Promise<SharedTheme | null> {
  checkRead(options);
  if (!validId(id)) return null;
  let row: Row | null;
  try {
    row = await getDocumentFromServer<Row>('shared_themes', id);
  } catch (error) {
    checkRead(options);
    if (unavailable(error)) return null;
    throw error;
  }
  checkRead(options);
  const theme = row ? normalizeSharedTheme(row, id) : null;
  if (!theme) return null;
  let creator = await getDocumentFromServer<Row>('profiles', theme.creator_id);
  checkRead(options);
  if (!creator) {
    const profiles = await getDocumentsFromServer<Row>('profiles', [where('user_id', '==', theme.creator_id), firestoreLimit(1)]);
    checkRead(options);
    creator = profiles[0] || null;
  }
  if (creator) theme.creator = {
    display_name: typeof creator.display_name === 'string' ? creator.display_name : null,
    avatar_url: typeof creator.avatar_url === 'string' ? creator.avatar_url : null,
    username: typeof creator.username === 'string' ? creator.username : null,
  };
  return theme;
}

export async function hasSavedTheme(ownerId: string, themeId: string): Promise<boolean> {
  const rows = await getDocumentsFromServer<Row>('saved_themes', [where('user_id', '==', ownerId), where('shared_theme_id', '==', themeId), firestoreLimit(1)]);
  return rows.some(row => row.user_id === ownerId && row.shared_theme_id === themeId);
}

/** Resolve explicit owned references instead of the unsupported nested SQL join. */
export async function loadSavedThemes(ownerId: string, options?: ReadOptions): Promise<SavedThemeCollection> {
  checkRead(options);
  if (!validId(ownerId)) throw new Error('Could not identify your theme library');
  const rows = await getDocumentsFromServer<Row>('saved_themes', [where('user_id', '==', ownerId)]);
  checkRead(options);
  // Sort locally so imported references without created_at are still visible.
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const references = new Map<string, string>();
  let unavailableCount = 0;
  for (const row of rows) {
    if (row.user_id !== ownerId) continue;
    if (!validId(row.shared_theme_id) || !validId(row.id)) { unavailableCount++; continue; }
    if (!references.has(row.shared_theme_id)) references.set(row.shared_theme_id, row.id);
  }
  const themes: SavedTheme[] = [];
  // Keep read concurrency bounded for large migrated collections.
  const entries = [...references];
  for (let offset = 0; offset < entries.length; offset += 8) {
    checkRead(options);
    const resolved = await Promise.all(entries.slice(offset, offset + 8).map(async ([id, savedId]) => {
      const theme = await loadSharedTheme(id, options);
      return theme ? { ...theme, saved_id: savedId } : null;
    }));
    checkRead(options);
    for (const theme of resolved) {
      if (theme) themes.push(theme);
      else unavailableCount++;
    }
  }
  return { themes, unavailableCount };
}

export async function loadOwnSharedThemes(ownerId: string, options?: ReadOptions): Promise<SharedTheme[]> {
  checkRead(options);
  if (!validId(ownerId)) throw new Error('Could not identify your theme library');
  const rows = await getDocumentsFromServer<Row>('shared_themes', [where('creator_id', '==', ownerId)]);
  checkRead(options);
  return rows.filter(row => row.creator_id === ownerId && validId(row.id))
    .map(row => normalizeSharedTheme(row, String(row.id))).filter((row): row is SharedTheme => Boolean(row))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
