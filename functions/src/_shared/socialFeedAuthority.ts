import { randomBytes } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { closeFriendAuthorityId, hasCloseFriendAuthority, normalizedProfileSettings, resolveIdentity, validAudienceId, type AudienceIdentity, type AudienceRow } from './profileAudienceAuthority.js';
import { followAuthorityId, hasApprovedFollow } from './followAuthority.js';

const PAGE_SIZE = 20;
const CURSOR_TTL = 10 * 60 * 1000;
export type SocialFeedInput = { expectedOwnerUid: string; expectedProfileId: string; cursor?: string };
export function normalizeSocialFeedInput(raw: unknown, uid: string): SocialFeedInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Feed details are required.');
  const row = raw as AudienceRow;
  if (row.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen the feed.');
  if (!validAudienceId(row.expectedProfileId) || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'cursor'].includes(key))
    || (row.cursor !== undefined && (typeof row.cursor !== 'string' || !/^[a-f0-9]{48}$/.test(row.cursor)))) {
    throw new HttpsError('invalid-argument', 'Invalid feed selection.');
  }
  return row as SocialFeedInput;
}
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : null;
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function dateText(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === 'string' && value.length <= 32 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

async function authorAdmission(db: Firestore, tx: Transaction, viewer: AudienceIdentity, alias: string) {
  const author = await resolveIdentity(db, tx, alias);
  if (!author) return null;
  const settings = normalizedProfileSettings((await tx.get(db.collection('profile_visibility').doc(author.profileId))).data(), author.profileId);
  const self = author.uid === viewer.uid;
  if (author.row.is_private != null && typeof author.row.is_private !== 'boolean') return null;
  if (author.row.is_private === true && !self && !hasApprovedFollow((await tx.get(db.collection('_follow_authority')
    .doc(followAuthorityId(author.uid, viewer.uid)))).data(), author, viewer)) return null;
  let friend = false; let close = false;
  if (!self) {
    const [outgoing, incoming, blocked, blocking, proof] = await Promise.all([
      tx.get(db.collection('friend_requests').where('sender_id', 'in', viewer.aliases).where('receiver_id', 'in', author.aliases).where('status', '==', 'accepted').limit(1)),
      tx.get(db.collection('friend_requests').where('sender_id', 'in', author.aliases).where('receiver_id', 'in', viewer.aliases).where('status', '==', 'accepted').limit(1)),
      tx.get(db.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', author.aliases).limit(1)),
      tx.get(db.collection('blocked_users').where('blocker_id', 'in', author.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
      tx.get(db.collection('_close_friend_authority').doc(closeFriendAuthorityId(author.uid, viewer.uid))),
    ]);
    if (!blocked.empty || !blocking.empty) return null;
    friend = !outgoing.empty || !incoming.empty;
    close = friend && hasCloseFriendAuthority(proof.data(), author, viewer);
  }
  const allows = (level: unknown) => typeof level === 'string' && ['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private'].includes(level)
    && (self || level === 'public' || level === 'everyone' || (level === 'friends' && friend) || (level === 'close_friends' && close));
  return { author, settings, allows };
}

function projectPost(id: string, row: AudienceRow, admission: NonNullable<Awaited<ReturnType<typeof authorAdmission>>>) {
  const { author, allows, settings } = admission;
  if (typeof row.type !== 'string' || !['post', 'short', 'video'].includes(row.type) || !allows(settings[row.type === 'short' ? 'clips' : 'posts'])) return null;
  // Apply every explicit restriction; unknown legacy values never widen access.
  for (const key of ['visibility', 'audience']) if (Object.hasOwn(row, key) && !allows(row[key])) return null;
  if (Object.hasOwn(row, 'is_private') && (typeof row.is_private !== 'boolean' || (row.is_private && !allows('only_me')))) return null;
  if (row.deleted_at || row.is_deleted || row.is_hidden || row.is_removed || row.removed_at
    || (row.status !== undefined && row.status !== 'published')
    || (row.moderation_status !== undefined && row.moderation_status !== 'approved')
    || (row.vybe_check_status !== undefined && row.vybe_check_status !== 'approved')) return null;
  const caption = text(row.caption ?? '', 10000), createdAt = dateText(row.created_at);
  const username = text(author.row.username, 100);
  if (caption === null || !createdAt || !username?.trim()) return null;
  const mediaUrl = row.media_url ? httpsUrl(row.media_url) : null;
  if (row.media_url && !mediaUrl) return null;
  if (!mediaUrl && (row.type !== 'post' || !caption.trim())) return null;
  const mediaUrls = row.media_urls == null ? [] : row.media_urls;
  if (!Array.isArray(mediaUrls) || mediaUrls.length > 20 || mediaUrls.some(url => !httpsUrl(url))) return null;
  const ageRating = row.age_rating ?? 'unrated';
  if (typeof ageRating !== 'string' || !['safe', '13+', '18+', 'unrated'].includes(ageRating)) return null;
  return {
    id, type: row.type as 'post' | 'short' | 'video', caption, createdAt,
    mediaUrl, mediaUrls: mediaUrls.map(url => httpsUrl(url)!), thumbnailUrl: httpsUrl(row.thumbnail_url), ageRating,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length <= 100).slice(0, 30) : [],
    author: { id: author.profileId, username, displayName: text(author.row.display_name, 200), avatarUrl: httpsUrl(author.row.avatar_url) },
  };
}

/** Account-bound, current-authority read foundation. Partner access is not enabled here. */
export async function readSocialFeedPage(db: Firestore, uid: string, raw: unknown, nowMs = Date.now()) {
  const input = normalizeSocialFeedInput(raw, uid);
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000 - CURSOR_TTL) throw new HttpsError('failed-precondition', 'Feed time is unavailable.');
  // Opaque server-owned cursors do not disclose IDs or timestamps of excluded posts.
  const newCursor = randomBytes(24).toString('hex');
  return db.runTransaction(async tx => {
    const viewer = await resolveIdentity(db, tx, uid);
    if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId) throw new HttpsError('failed-precondition', 'Your profile changed. Reopen the feed.');
    let query = db.collection('posts').orderBy('created_at', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(PAGE_SIZE + 1);
    if (input.cursor) {
      const cursor = (await tx.get(db.collection('_social_feed_cursors').doc(input.cursor))).data();
      if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId
        || !(cursor.expires_at instanceof Timestamp) || cursor.expires_at.toMillis() <= nowMs
        || typeof cursor.post_id !== 'string' || !cursor.post_id || cursor.post_id.includes('/') || Buffer.byteLength(cursor.post_id) > 1500
        || !Object.hasOwn(cursor, 'created_at')) throw new HttpsError('failed-precondition', 'This feed page expired. Refresh the feed.');
      query = query.startAfter(cursor.created_at, cursor.post_id);
    }
    const snapshot = await tx.get(query);
    const candidates = snapshot.docs.slice(0, PAGE_SIZE);
    const admissions = new Map<string, ReturnType<typeof authorAdmission>>();
    const posts = [];
    for (const post of candidates) {
      const row = post.data();
      // Historical aliases may identify the same account; conflicting owners cannot.
      if (!validAudienceId(row.author_id)) continue;
      if (!admissions.has(row.author_id)) admissions.set(row.author_id, authorAdmission(db, tx, viewer, row.author_id));
      const admission = await admissions.get(row.author_id)!;
      if (!admission || (row.user_id !== undefined && (typeof row.user_id !== 'string' || !admission.author.aliases.includes(row.user_id)))) continue;
      const projected = projectPost(post.id, row, admission);
      if (projected) posts.push(projected);
    }
    let nextCursor: string | null = null;
    const last = candidates.at(-1);
    if (snapshot.size > PAGE_SIZE && last) {
      // The raw boundary may be malformed content. Firestore still orders it;
      // retain it privately so a bad row cannot permanently strand pagination.
      tx.create(db.collection('_social_feed_cursors').doc(newCursor), {
        version: 1, owner_uid: uid, profile_id: viewer.profileId, post_id: last.id,
        created_at: last.data().created_at, expires_at: Timestamp.fromMillis(nowMs + CURSOR_TTL),
      });
      nextCursor = newCursor;
    }
    return { ownerUid: uid, viewerProfileId: viewer.profileId, posts, nextCursor };
  });
}
