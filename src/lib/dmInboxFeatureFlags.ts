/**
 * Messages redesign rollout flags.
 *
 * Defaults keep the redesign OFF for everyone.
 * Enable gradually via:
 * 1. Internal allowlist (profile ids / auth uids)
 * 2. Percentage rollout (sticky hash of profile id)
 * 3. Explicit localStorage override for QA (`vybe-dm-flag:<name>`)
 *
 * Server-driven config (optional): Firestore `app_config/dm_inbox_rollout`
 * `{ internal_ids: string[], projection_read_pct: number, redesign_ui_pct: number }`
 */
const STORAGE_PREFIX = 'vybe-dm-flag:';
const ROLLOUT_DOC_CACHE_KEY = 'vybe-dm-rollout-config';

export type DmInboxFlag =
  | 'dm_inbox_projection_read'
  | 'dm_inbox_projection_shadow'
  | 'dm_inbox_redesign_ui'
  | 'dm_inbox_legacy_fallback';

const DEFAULTS: Record<DmInboxFlag, boolean> = {
  dm_inbox_projection_read: false,
  dm_inbox_projection_shadow: true,
  dm_inbox_redesign_ui: false,
  dm_inbox_legacy_fallback: true,
};

export interface DmInboxRolloutConfig {
  internal_ids: string[];
  /** Optional second allowlist for redesign UI (after projection read is stable). */
  redesign_internal_ids?: string[];
  /** 0–100. Applied only when not internal and flag default/env is off. */
  projection_read_pct: number;
  redesign_ui_pct: number;
}

const DEFAULT_ROLLOUT: DmInboxRolloutConfig = {
  internal_ids: [],
  redesign_internal_ids: [],
  projection_read_pct: 0,
  redesign_ui_pct: 0,
};

let cachedRollout: DmInboxRolloutConfig = { ...DEFAULT_ROLLOUT };
let rolloutLoaded = false;

function readStorage(flag: DmInboxFlag): boolean | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${flag}`);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return null;
}

function envFlag(flag: DmInboxFlag): boolean | null {
  if (typeof import.meta === 'undefined') return null;
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  const key = `VITE_${flag.toUpperCase()}`;
  if (env?.[key] === '1' || env?.[key] === 'true') return true;
  if (env?.[key] === '0' || env?.[key] === 'false') return false;
  return null;
}

function parseIdList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function envInternalIds(): string[] {
  if (typeof import.meta === 'undefined') return [];
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return parseIdList(env?.VITE_DM_INBOX_INTERNAL_IDS);
}

/** Stable 0–99 bucket for percentage rollouts. */
export function rolloutBucket(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

export function getDmInboxRolloutConfig(): DmInboxRolloutConfig {
  return cachedRollout;
}

export function setDmInboxRolloutConfig( partial: Partial<DmInboxRolloutConfig>): void {
  cachedRollout = {
    internal_ids: Array.isArray(partial.internal_ids)
      ? partial.internal_ids.map(String)
      : cachedRollout.internal_ids,
    redesign_internal_ids: Array.isArray(partial.redesign_internal_ids)
      ? partial.redesign_internal_ids.map(String)
      : cachedRollout.redesign_internal_ids || [],
    projection_read_pct: clampPct(
      partial.projection_read_pct ?? cachedRollout.projection_read_pct,
    ),
    redesign_ui_pct: clampPct(partial.redesign_ui_pct ?? cachedRollout.redesign_ui_pct),
  };
  rolloutLoaded = true;
  try {
    localStorage.setItem(ROLLOUT_DOC_CACHE_KEY, JSON.stringify(cachedRollout));
  } catch {
    /* ignore */
  }
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function hydrateRolloutFromCache(): void {
  if (rolloutLoaded || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ROLLOUT_DOC_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<DmInboxRolloutConfig>;
    setDmInboxRolloutConfig(parsed);
  } catch {
    /* ignore */
  }
}

hydrateRolloutFromCache();

export function isInternalDmInboxAccount(
  profileId?: string | null,
  authUid?: string | null,
): boolean {
  const ids = new Set([
    ...envInternalIds(),
    ...cachedRollout.internal_ids,
  ]);
  if (profileId && ids.has(profileId)) return true;
  if (authUid && ids.has(authUid)) return true;
  return false;
}

export function getDmInboxFlag(flag: DmInboxFlag): boolean {
  const stored = readStorage(flag);
  if (stored != null) return stored;
  const fromEnv = envFlag(flag);
  if (fromEnv != null) return fromEnv;
  return DEFAULTS[flag];
}

export function setDmInboxFlag(flag: DmInboxFlag, value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${flag}`, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Shadow compare stays on by default for everyone (logging only).
 */
export function isDmInboxShadowCompareEnabled(): boolean {
  return getDmInboxFlag('dm_inbox_projection_shadow');
}

/**
 * Projection reads: internal accounts first, then percentage rollout.
 * Explicit localStorage / env overrides always win.
 */
export function isDmInboxProjectionReadEnabled(
  profileId?: string | null,
  authUid?: string | null,
): boolean {
  const stored = readStorage('dm_inbox_projection_read');
  if (stored != null) return stored;
  const fromEnv = envFlag('dm_inbox_projection_read');
  if (fromEnv != null) return fromEnv;

  if (isInternalDmInboxAccount(profileId, authUid)) return true;

  const pct = cachedRollout.projection_read_pct;
  if (pct <= 0) return false;
  const seed = profileId || authUid;
  if (!seed) return false;
  return rolloutBucket(`projection:${seed}`) < pct;
}

/**
 * Redesign UI: requires projection read, then explicit override / percentage /
 * redesign_internal_ids. Internal projection allowlist alone does NOT flip UI.
 */
export function isDmInboxRedesignUiEnabled(
  profileId?: string | null,
  authUid?: string | null,
): boolean {
  if (!isDmInboxProjectionReadEnabled(profileId, authUid)) return false;

  const stored = readStorage('dm_inbox_redesign_ui');
  if (stored != null) return stored;
  const fromEnv = envFlag('dm_inbox_redesign_ui');
  if (fromEnv != null) return fromEnv;

  const redesignInternal = new Set(cachedRollout.redesign_internal_ids || []);
  if (
    (profileId && redesignInternal.has(profileId)) ||
    (authUid && redesignInternal.has(authUid))
  ) {
    return true;
  }

  const pct = cachedRollout.redesign_ui_pct;
  if (pct <= 0) return false;
  const seed = profileId || authUid;
  if (!seed) return false;
  return rolloutBucket(`redesign:${seed}`) < pct;
}

/**
 * Load optional Firestore rollout doc. Safe to call on app mount.
 * Doc: app_config/dm_inbox_rollout
 */
export async function loadDmInboxRolloutConfig(): Promise<DmInboxRolloutConfig> {
  try {
    const { getDocument } = await import('@/lib/firebase/firestoreDb');
    const doc = await getDocument<Partial<DmInboxRolloutConfig>>('app_config', 'dm_inbox_rollout');
    if (doc) {
      setDmInboxRolloutConfig({
        internal_ids: Array.isArray(doc.internal_ids) ? doc.internal_ids.map(String) : [],
        redesign_internal_ids: Array.isArray(doc.redesign_internal_ids)
          ? doc.redesign_internal_ids.map(String)
          : [],
        projection_read_pct: Number(doc.projection_read_pct) || 0,
        redesign_ui_pct: Number(doc.redesign_ui_pct) || 0,
      });
    }
  } catch (err) {
    console.warn('[dm-inbox-rollout] config load failed', err);
  }
  return cachedRollout;
}
