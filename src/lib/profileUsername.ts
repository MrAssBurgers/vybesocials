/** Exact handle, lowercase, and a single capital letter. Firestore username equality is case-sensitive. */
export function profileUsernameCandidates(raw: string): string[] {
  const name = raw.trim().replace(/^@+/, '');
  if (!name || name.includes('/')) return [];
  const lower = name.toLowerCase();
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1);
  return [...new Set([name, lower, titled])];
}

type ProfileIdentityRow = { id?: unknown; user_id?: unknown; deleted_at?: unknown; is_deleted?: unknown };

function isActiveProfileRow(row: ProfileIdentityRow): boolean {
  return !row.deleted_at && row.is_deleted !== true;
}

/** A live Auth profile uses the Auth uid as its document id. Older imports can
 * keep a second document with the same username and a different user id. */
function isCanonicalProfileRow(row: ProfileIdentityRow): boolean {
  return typeof row.id === 'string' && row.id.length > 0 && !row.id.includes('/')
    && (row.user_id === row.id || row.user_id == null || row.user_id === '');
}

/** Pick one profile for a username. A single Auth-owned document wins over leftover
 * duplicates. Two live Auth-owned documents stay unresolved. */
export function chooseProfileIdentity<T extends ProfileIdentityRow>(
  rows: T[],
  preferredId?: string | null,
  ambiguousMessage = 'This username needs an identity review.',
): T | null {
  const usable = rows.filter(isActiveProfileRow);
  const preferred = preferredId?.trim();
  if (preferred && !preferred.includes('/')) {
    const matches = usable.filter(row => row.id === preferred || row.user_id === preferred);
    if (matches.length > 1) throw new Error(ambiguousMessage);
    if (matches.length === 1) return matches[0];
  }
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0];
  const canonical = usable.filter(isCanonicalProfileRow);
  if (canonical.length === 1) return canonical[0];
  throw new Error(ambiguousMessage);
}
