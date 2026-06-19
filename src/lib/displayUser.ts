import { isGeneratedUsername } from '@/lib/username';

/** Username is the canonical handle — never prefer display_name over @username. */
export function preferredUsername(
  profile?: { username?: string | null; display_name?: string | null } | null,
): string {
  const username = (profile?.username || '').trim();
  if (username && !isGeneratedUsername(username)) return username;
  const display = (profile?.display_name || '').trim();
  if (display && !isGeneratedUsername(display)) return display.replace(/\s+/g, '').toLowerCase();
  return username || 'vybeuser';
}

export function formatUserLabel(
  profile?: { username?: string | null; display_name?: string | null } | null,
): string {
  const handle = preferredUsername(profile);
  return handle.startsWith('@') ? handle : `@${handle}`;
}
