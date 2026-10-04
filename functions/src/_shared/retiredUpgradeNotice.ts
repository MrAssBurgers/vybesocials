/** Keep in parity with src/lib/migrationNotice.ts for historical seed records. */
export function isRetiredUpgradeNotice(notice: {
  id?: unknown;
  announcement_id?: unknown;
  type?: unknown;
  title?: unknown;
}): boolean {
  if (notice.type != null && notice.type !== 'announcement') return false;
  if (notice.id === 'firebase-migration-2026-06' || notice.announcement_id === 'firebase-migration-2026-06') return true;
  // The original seeder created notifications without an announcement ID.
  const title = typeof notice.title === 'string' ? notice.title.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '').toLowerCase() : '';
  return title === 'vybe was upgraded' || title === 'vybe has been upgraded';
}
