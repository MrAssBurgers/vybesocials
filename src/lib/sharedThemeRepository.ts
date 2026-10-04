import { getDocumentsFromServer, where, orderBy, firestoreLimit } from '@/lib/firebase/firestoreDb';
import type { SharedTheme } from '@/hooks/useSharedThemes';
import { normalizeSharedThemeTokens, normalizeSharedThemeLayout, themeHttpsUrl } from '@/lib/sharedThemeSchema';
import type { ThemeTokens } from '@/hooks/useCustomTheme';
import { themeAuthorityRequest, type ThemeActor } from '@/lib/themeAuthorityClient';

type Row = Record<string, unknown>;
type ReadOptions = { signal?: AbortSignal; actor?: ThemeActor };
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

export function normalizeSharedTheme(row: Row, id: string): SharedTheme | null {
  if (!validId(id) || !validId(row.creator_id)) return null;
  let tokens: ThemeTokens;
  let layout: SharedTheme['layout_settings'];
  try {
    tokens = normalizeSharedThemeTokens(row.theme_tokens) as unknown as ThemeTokens;
    layout = normalizeSharedThemeLayout(row.layout_settings);
  } catch { return null; }
  let creator: SharedTheme['creator'];
  if (row.creator && typeof row.creator === 'object' && !Array.isArray(row.creator)) {
    const value = row.creator as Row;
    let avatar: string | null = null;
    try { avatar = value.avatar_url ? themeHttpsUrl(value.avatar_url) : null; } catch { /* Omit malformed profile images. */ }
    creator = { username: typeof value.username === 'string' ? value.username.slice(0, 80) : null,
      display_name: typeof value.display_name === 'string' ? value.display_name.slice(0, 120) : null, avatar_url: avatar };
  }
  const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return {
    id, creator_id: row.creator_id,
    theme_name: typeof row.theme_name === 'string' ? row.theme_name.slice(0, 80) : 'Untitled theme',
    theme_tokens: tokens,
    layout_settings: layout, creator,
    description: typeof row.description === 'string' ? row.description.slice(0, 500) : null,
    likes_count: count(row.likes_count), downloads_count: count(row.downloads_count),
    is_public: row.is_public === true,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 40).slice(0, 10) : null,
    category: typeof row.category === 'string' ? row.category.slice(0, 40) : null,
  };
}

/** Every detail rechecks current link/grant/friendship authority on the server. */
export async function loadSharedTheme(id: string, options?: ReadOptions): Promise<SharedTheme | null> {
  checkRead(options);
  if (!validId(id)) return null;
  if (!options?.actor) throw new Error('Sign in before opening a shared theme.');
  const result = await themeAuthorityRequest(options.actor, 'manage-shared-theme', { action: 'read', themeId: id }, options.signal);
  checkRead(options);
  if (result.ownerUid !== options.actor.uid || result.profileId !== options.actor.profileId) throw new Error('The theme request was not confirmed. Please retry.');
  if (result.theme === null) return null;
  const row = result.theme;
  if (!row || typeof row !== 'object' || Array.isArray(row) || (row as Row).id !== id) throw new Error('The theme could not be verified. Please retry.');
  const theme = normalizeSharedTheme(row as Row, id);
  if (!theme) throw new Error('This theme contains unsupported settings.');
  return theme;
}

/** Raw public rows identify candidates only; current admission supplies all rendered content. */
export async function loadPublicSharedThemes(actor: ThemeActor, search = '', signal?: AbortSignal): Promise<SharedTheme[]> {
  const candidates = await getDocumentsFromServer<Row>('shared_themes', [where('is_public', '==', true), orderBy('likes_count', 'desc'), firestoreLimit(50)]);
  checkRead({ signal });
  const ids = [...new Set(candidates.map(row => row.id).filter(validId))];
  const admitted: SharedTheme[] = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    const batch = ids.slice(offset, offset + 20);
    const result = await themeAuthorityRequest(actor, 'manage-shared-theme', { action: 'readMany', themeIds: batch }, signal);
    checkRead({ signal });
    if (result.ownerUid !== actor.uid || result.profileId !== actor.profileId || !Array.isArray(result.themes) || result.themes.length > batch.length) throw new Error('Themes could not be verified. Please retry.');
    const seen = new Set<string>();
    for (const value of result.themes) {
      if (!value || typeof value !== 'object' || !batch.includes(value.id) || seen.has(value.id)) throw new Error('Themes could not be verified. Please retry.');
      seen.add(value.id);
      const theme = normalizeSharedTheme(value, value.id);
      if (!theme || !theme.is_public) throw new Error('Themes could not be verified. Please retry.');
      admitted.push(theme);
    }
  }
  const query = search.trim().toLocaleLowerCase();
  return admitted.filter(theme => !query || theme.theme_name.toLocaleLowerCase().includes(query));
}

export async function hasSavedTheme(ownerId: string, themeId: string): Promise<boolean> {
  const rows = await getDocumentsFromServer<Row>('saved_themes', [where('user_id', '==', ownerId), where('shared_theme_id', '==', themeId), firestoreLimit(1)]);
  return rows.some(row => row.user_id === ownerId && row.shared_theme_id === themeId);
}

/** Resolve explicit owned references instead of the unsupported nested SQL join. */
export async function loadSavedThemes(ownerId: string, options?: ReadOptions): Promise<SavedThemeCollection> {
  checkRead(options);
  if (!validId(ownerId)) throw new Error('Could not identify your theme library');
  const owners = [...new Set([ownerId, ...(options?.actor ? [options.actor.uid] : [])])];
  const rows = (await Promise.all(owners.map(owner => getDocumentsFromServer<Row>('saved_themes', [where('user_id', '==', owner)])))).flat();
  checkRead(options);
  // Sort locally so imported references without created_at are still visible.
  rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const references = new Map<string, string>();
  let unavailableCount = 0;
  for (const row of rows) {
    if (!owners.includes(String(row.user_id))) continue;
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
  const owners = [...new Set([ownerId, ...(options?.actor ? [options.actor.uid] : [])])];
  const rows = (await Promise.all(owners.map(owner => getDocumentsFromServer<Row>('shared_themes', [where('creator_id', '==', owner)])))).flat();
  checkRead(options);
  return rows.filter(row => owners.includes(String(row.creator_id)) && validId(row.id))
    .map(row => normalizeSharedTheme({ ...row, creator_id: ownerId }, String(row.id))).filter((row): row is SharedTheme => Boolean(row))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
