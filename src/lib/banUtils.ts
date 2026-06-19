/** Shared ban record shape (user_bans row). */
export interface BanRecord {
  id?: string;
  user_id?: string;
  reason?: string;
  expires_at?: string | null;
  is_permanent?: boolean | null;
  is_meme_ban?: boolean | null;
  custom_gif_url?: string | null;
  created_at?: string;
  banned_by?: string;
}

/** True when a ban should block the user or appear as active in moderation UI. */
export function isBanActive(
  ban: BanRecord | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!ban) return false;
  if (ban.is_permanent) return true;
  if (!ban.expires_at) return false;
  return new Date(ban.expires_at).getTime() > now.getTime();
}

/** Newest active ban, or null if none. */
export function pickActiveBan<T extends BanRecord>(
  bans: T[] | null | undefined,
  now: Date = new Date(),
): T | null {
  if (!bans?.length) return null;

  const sorted = [...bans].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  return sorted.find((ban) => isBanActive(ban, now)) ?? null;
}

export function filterActiveBans<T extends BanRecord>(
  bans: T[] | null | undefined,
  now: Date = new Date(),
): T[] {
  if (!bans?.length) return [];
  return bans.filter((ban) => isBanActive(ban, now));
}
