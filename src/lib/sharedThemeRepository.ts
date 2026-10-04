import { getDocumentsFromServer, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
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

function pageCursor(result: Row, actor: ThemeActor, previous: Set<string>): string | null {
  const cursor = result.nextCursor;
  if (result.ownerUid !== actor.uid || result.profileId !== actor.profileId || !(cursor === null || (typeof cursor === 'string' && /^[a-f0-9]{48}$/.test(cursor)))) throw new Error('Themes could not be verified. Please retry.');
  if (typeof cursor === 'string') {
    if (previous.has(cursor)) throw new Error('Theme pagination did not advance. Please retry.');
    previous.add(cursor);
    return cursor;
  }
  return null;
}
export interface PublicThemePage { themes: SharedTheme[]; nextCursor: string | null }

/** Only checked server DTOs cross the browser boundary, including candidate selection. */
export async function loadPublicSharedThemes(actor: ThemeActor, search = '', signal?: AbortSignal, cursor?: string | null): Promise<PublicThemePage> {
  checkRead({ signal });
  const query = search.trim();
  if (query.length > 80) throw new Error('Use up to eighty characters to search themes.');
  const admitted: SharedTheme[] = [];
  const seen = new Set<string>(); const cursors = new Set<string>(cursor ? [cursor] : []);
  const result = await themeAuthorityRequest(actor, 'manage-shared-theme', { action: 'list', search: query, ...(cursor ? { cursor } : {}) }, signal);
  checkRead({ signal });
  const nextCursor = pageCursor(result, actor, cursors);
  if (!Array.isArray(result.themes) || result.themes.length > 50) throw new Error('Themes could not be verified. Please retry.');
  for (const value of result.themes) {
    if (!value || typeof value !== 'object' || !validId(value.id) || seen.has(value.id)) throw new Error('Themes could not be verified. Please retry.');
    seen.add(value.id);
    const theme = normalizeSharedTheme(value, value.id);
    if (!theme || !theme.is_public || (query && !theme.theme_name.toLocaleLowerCase('en-US').includes(query.toLocaleLowerCase('en-US')))) throw new Error('Themes could not be verified. Please retry.');
    admitted.push(theme);
  }
  checkRead({ signal });
  return { themes: admitted, nextCursor };
}

export async function hasSavedTheme(ownerId: string, themeId: string): Promise<boolean> {
  const rows = await getDocumentsFromServer<Row>('saved_themes', [where('user_id', '==', ownerId), where('shared_theme_id', '==', themeId), firestoreLimit(1)]);
  return rows.some(row => row.user_id === ownerId && row.shared_theme_id === themeId);
}

/** Drain bounded server pages so large or migrated libraries never truncate silently. */
export async function loadSavedThemes(ownerId: string, options?: ReadOptions): Promise<SavedThemeCollection> {
  checkRead(options);
  const actor = options?.actor;
  if (!actor || ![actor.uid, actor.profileId].includes(ownerId)) throw new Error('Could not identify your theme library');
  const cursors = new Set<string>(); const savedIds = new Set<string>();
  const latestAdmissions = new Map<string, SharedTheme | null>();
  const references: { savedId: string; themeId: string | null; createdAt: string; theme: SharedTheme | null }[] = [];
  let cursor: string | null = null;
  do {
    const result = await themeAuthorityRequest(actor, 'manage-shared-theme', { action: 'listSaved', ...(cursor ? { cursor } : {}) }, options.signal);
    checkRead(options);
    cursor = pageCursor(result, actor, cursors);
    if (!Array.isArray(result.references) || result.references.length > 50) throw new Error('Your theme library could not be verified. Please retry.');
    for (const value of result.references) {
      if (!value || typeof value !== 'object' || !validId(value.savedId) || savedIds.has(value.savedId) || !(value.themeId === null || validId(value.themeId))
        || typeof value.createdAt !== 'string' || value.createdAt.length > 100 || !(value.theme === null || (value.theme && typeof value.theme === 'object' && value.theme.id === value.themeId))) throw new Error('Your theme library could not be verified. Please retry.');
      const theme = value.theme === null ? null : normalizeSharedTheme(value.theme, value.themeId);
      if (value.theme !== null && !theme) throw new Error('This theme contains unsupported settings.');
      if (value.themeId) latestAdmissions.set(value.themeId, theme);
      savedIds.add(value.savedId); references.push({ savedId: value.savedId, themeId: value.themeId, createdAt: value.createdAt, theme });
    }
  } while (cursor);
  checkRead(options);
  references.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>(); const themes: SavedTheme[] = []; let unavailableCount = 0;
  for (const reference of references) {
    if (!reference.themeId) { unavailableCount++; continue; }
    if (seen.has(reference.themeId)) continue;
    seen.add(reference.themeId);
    const currentTheme = latestAdmissions.get(reference.themeId);
    if (currentTheme) themes.push({ ...currentTheme, saved_id: reference.savedId });
    else unavailableCount++;
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
