import { getFirebaseAuth } from './firebase/authService';
import { invokeFunction } from './firebase/functionsService';
import { profileAccountGuard } from './profileAccountGuard';
import { getForegroundReadPhase, foregroundReadPhaseCurrent } from './foregroundReadPhase';

const OWNERS: Record<string, string | null> = { profile: null, private_profile: null, posts: 'author_id', legacy_posts: 'user_id', comments: 'user_id', legacy_comments: 'author_id', messages: 'sender_id', channel_messages: 'sender_id', stories: 'author_id', legacy_stories: 'user_id', bookmarks: 'user_id', likes: 'user_id', comment_likes: 'user_id', post_reactions: 'user_id', post_views: 'viewer_id', story_views: 'viewer_id', interactions: 'user_id', mood_signals: 'user_id', follows: 'follower_id', blocks: 'blocker_id', hubs: 'owner_id', notes: 'user_id', saved_sounds: 'user_id' };
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const invalid = () => new Error('The export could not be verified. No partial download was created. Try again.');
type Row = Record<string, unknown>;
type Page = { ok: true; version: 1; ownerUid: string; profileId: string; accountCreatedAt: number; requestId: string; section: string; after: string | null; sections: string[]; records: Row[]; nextAfter: string | null; readAt: string };

/** Collect all advertised pages in memory; do not download partial data or queue
 * private exports offline. Three section readers bound transport concurrency. */
export async function collectAccountDataExport(uid: string, profileId: string, extraGuard?: () => void): Promise<Blob> {
  const accountGuard = profileAccountGuard(uid, extraGuard), user = getFirebaseAuth()?.currentUser;
  const created = Date.parse(user?.metadata.creationTime || ''), phase = getForegroundReadPhase();
  const guard = () => {
    accountGuard();
    if (!user || getFirebaseAuth()?.currentUser !== user || user.uid !== uid || Date.parse(user.metadata.creationTime || '') !== created || !validId(profileId)) throw new Error('Your account changed. Reopen account settings.');
    if (!foregroundReadPhaseCurrent(phase) || navigator.onLine === false) throw new Error('The export was interrupted. Keep Vybe open and online, then try again.');
  };
  if (!Number.isSafeInteger(created) || created <= 0) throw invalid();
  guard();
  const read = async (section: string, after: string | null): Promise<Page> => {
    guard(); const requestId = crypto.randomUUID(); let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('The export took too long. Try again; no partial download was created.')), 15000); });
    try {
      const { data, error } = await Promise.race([invokeFunction<Page>('manageAccount', { action: 'export', requestId, section, after, expectedOwnerUid: uid, expectedProfileId: profileId, expectedAccountCreatedAt: created }), timeout]);
      guard(); if (error) throw error;
      const page = data;
      if (!page || page.ok !== true || page.version !== 1 || page.ownerUid !== uid || page.profileId !== profileId || page.accountCreatedAt !== created || page.requestId !== requestId || page.section !== section || page.after !== after
        || !Array.isArray(page.sections) || page.sections.length !== Object.keys(OWNERS).length || new Set(page.sections).size !== page.sections.length || page.sections.some(name => !Object.prototype.hasOwnProperty.call(OWNERS, name))
        || !Array.isArray(page.records) || page.records.length > 50 || page.nextAfter !== null && (!validId(page.nextAfter) || !page.records.length || page.nextAfter !== page.records.at(-1)?.id)
        || typeof page.readAt !== 'string' || !Number.isFinite(Date.parse(page.readAt))) throw invalid();
      const ids = new Set<string>(); const owner = OWNERS[section];
      for (const row of page.records) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || !validId(row.id) || ids.has(row.id) || owner === null && row.id !== profileId || owner !== null && ![uid, profileId].includes(String(row[owner]))) throw invalid();
        ids.add(row.id);
      }
      return page;
    } finally { clearTimeout(timer!); }
  };
  const startedAt = new Date().toISOString(), first = await read('profile', null);
  if (first.records.length !== 1 || first.nextAfter !== null || first.records[0].user_id !== uid) throw invalid();
  const sections: Record<string, Row[]> = {}; let bytes = 0, rows = 0, stopped = false;
  const add = (page: Page) => {
    guard(); const serialized = JSON.stringify(page.records); bytes += new TextEncoder().encode(serialized).byteLength; rows += page.records.length;
    if (bytes > 16 * 1024 * 1024 || rows > 100000) throw new Error('This export is too large for an in-app download. Contact support for the full export. No partial download was created.');
    (sections[page.section] ??= []).push(...page.records);
  };
  add(first); const queue = first.sections.filter(name => name !== 'profile');
  const worker = async () => {
    while (!stopped && queue.length) {
      const section = queue.shift()!, cursors = new Set<string>(); let after: string | null = null;
      do {
        guard(); if (stopped) return;
        const page = await read(section, after); if (stopped) return; add(page);
        after = page.nextAfter;
        if (after && cursors.has(after)) throw invalid(); if (after) cursors.add(after);
      } while (after);
    }
  };
  try { await Promise.all([worker(), worker(), worker()]); }
  catch (error) { stopped = true; throw error; }
  guard();
  // Legacy lookup sections are explicit and retain document IDs; no silent merge
  // of historical identities or snapshot-wide consistency claim.
  return new Blob([JSON.stringify({ format: 'vybe-personal-data', version: 1, ownerUid: uid, profileId, startedAt, completedAt: new Date().toISOString(),
    scope: 'Profile, your authored posts/comments/messages/stories, bookmarks, reactions, viewing and interaction activity, follows, blocks, owned hubs, notes and saved sounds. Media references are included; this JSON does not contain media file bytes or other people\'s authored messages. Security credentials and staff/private service evidence are excluded. Pages reflect individual read times.', sections }, null, 2)], { type: 'application/json' });
}
