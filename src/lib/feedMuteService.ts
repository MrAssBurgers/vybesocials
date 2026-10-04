import { collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, where, type QueryDocumentSnapshot } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountGuard } from '@/lib/reportModerationService';

export { reportAccountGuard as feedMuteAccountGuard, reportAccountSnapshot as feedMuteAccountSnapshot, isReportSessionError as isFeedMuteSessionError } from '@/lib/reportModerationService';
export interface FeedMute { profileId: string; uid: string; needsRepair?: boolean }
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && !Array.from(value).some(char => char.charCodeAt(0) < 32) && value !== '.' && value !== '..';
function identity(value: unknown): string { if (!validId(value)) throw new Error('Open this account again before changing its feed mute.'); return value; }
function owner(guard: ReportAccountGuard) { guard(); return identity(reportAccountSnapshot().uid); }
function decodeMute(id: string, row: Record<string, unknown>, uid: string): FeedMute {
  if (row.schema_version !== 1 || row.owner_uid !== uid || row.target_profile_id !== id || !validId(row.target_uid) || row.target_uid === uid) throw new Error('A feed mute could not be verified. Please retry in Settings.');
  return { profileId: id, uid: row.target_uid };
}

/** Page through the complete private list; never silently ignore later mutes. */
export async function listFeedMutes(guard = reportAccountGuard()): Promise<FeedMute[]> {
  const uid = owner(guard); const database = getFirestoreDb(); const rows: FeedMute[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  do {
    guard();
    const page = await getDocsFromServer(query(collection(database, 'feed_mutes', uid, 'authors'), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(200)));
    guard();
    for (const item of page.docs) {
      try { rows.push(decodeMute(item.id, item.data(), uid)); }
      catch { rows.push({ profileId: item.id, uid: '', needsRepair: true }); }
    }
    if (page.size < 200) break;
    cursor = page.docs[page.docs.length - 1];
  } while (cursor);
  return rows;
}

async function resolveTarget(targetId: string, guard: ReportAccountGuard): Promise<FeedMute> {
  const database = getFirestoreDb();
  const direct = await getDocFromServer(doc(database, 'profiles', identity(targetId)));
  guard();
  if (direct.exists()) return { profileId: direct.id, uid: identity(direct.data().user_id) };
  const matches = await getDocsFromServer(query(collection(database, 'profiles'), where('user_id', '==', targetId), limit(2)));
  guard();
  if (matches.size !== 1) throw new Error('This account could not be verified. Open its profile and try again.');
  return { profileId: matches.docs[0].id, uid: identity(matches.docs[0].data().user_id) };
}

/** Transactions acknowledge the real server write and make same-target retries safe. */
export async function saveFeedMute(targetId: string, guard = reportAccountGuard()): Promise<FeedMute> {
  const uid = owner(guard); const target = await resolveTarget(targetId, guard);
  if (target.uid === uid) throw new Error('You cannot mute your own account.');
  const database = getFirestoreDb(); const muteRef = doc(database, 'feed_mutes', uid, 'authors', target.profileId);
  await runTransaction(database, async transaction => {
    guard();
    const existing = await transaction.get(muteRef);
    const profile = await transaction.get(doc(database, 'profiles', target.profileId));
    guard();
    if (!profile.exists() || profile.data().user_id !== target.uid) throw new Error('This account changed. Open its profile and try again.');
    if (existing.exists()) {
      const saved = decodeMute(existing.id, existing.data(), uid);
      if (saved.uid !== target.uid) throw new Error('This feed mute needs to be removed in Settings before saving it again.');
      return;
    }
    transaction.set(muteRef, { schema_version: 1, owner_uid: uid, target_profile_id: target.profileId, target_uid: target.uid, created_at: serverTimestamp() });
  });
  guard();
  return target;
}

/** Removal uses the stored profile ID, so deleted target accounts can be unmuted. */
export async function removeFeedMute(profileId: string, guard = reportAccountGuard()): Promise<void> {
  const uid = owner(guard);
  // Repair rows may have longer legacy IDs than the supported create API, but
  // removal still targets one exact document in this account's own collection.
  if (typeof profileId !== 'string' || !profileId || profileId.includes('/') || profileId === '.' || profileId === '..' || new TextEncoder().encode(profileId).byteLength > 1500) throw new Error('Invalid saved mute identity.');
  const database = getFirestoreDb(); const reference = doc(database, 'feed_mutes', uid, 'authors', profileId);
  // A transaction fails offline instead of silently queuing a removal that
  // could later surprise a different session. Missing rows are a safe retry.
  await runTransaction(database, async transaction => {
    guard(); const saved = await transaction.get(reference); guard();
    if (saved.exists()) transaction.delete(reference);
  });
  guard();
}

export function mutedAuthorIds(rows: readonly FeedMute[]): Set<string> { return new Set(rows.filter(row => !row.needsRepair).flatMap(row => [row.profileId, row.uid])); }
export function filterMutedPosts<T extends { author?: { id?: string }; author_id?: string }>(posts: readonly T[], aliases: ReadonlySet<string>): T[] {
  return posts.filter(post => !aliases.has(post.author?.id || '') && !aliases.has(post.author_id || ''));
}
