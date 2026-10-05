import { randomBytes } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId, type AudienceRow } from './profileAudienceAuthority.js';
import { authorAdmission, projectPost, validPostDocumentId } from './socialFeedAuthority.js';

const SCOPES = ['profile', 'saved', 'sound', 'filter', 'search', 'tagged', 'recent'] as const;
export type SocialPostListInput = { expectedOwnerUid: string; expectedProfileId: string; scope: typeof SCOPES[number]; targetId?: string;
  search?: string; since?: string; contentType?: 'post' | 'short' | 'video'; cursor?: string };
export function normalizeSocialPostListInput(raw: unknown, uid: string): SocialPostListInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Post selection is required.');
  const row = raw as AudienceRow;
  if (row.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen these posts.');
  if (!validAudienceId(row.expectedProfileId) || !SCOPES.some(scope => scope === row.scope)
    || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'scope', 'targetId', 'search', 'since', 'contentType', 'cursor'].includes(key))
    || (['profile', 'sound', 'filter', 'tagged'].some(scope => scope === row.scope) ? !validAudienceId(row.targetId) : row.targetId !== undefined)
    || (row.scope === 'search' ? typeof row.search !== 'string' || row.search.trim() !== row.search || row.search.length < 2 || row.search.length > 100 : row.search !== undefined)
    || (row.scope === 'recent' ? typeof row.since !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(row.since) || !Number.isFinite(Date.parse(row.since)) || row.since.length > 32 : row.since !== undefined)
    || (row.contentType !== undefined && !['post', 'short', 'video'].some(type => type === row.contentType))
    || (row.cursor !== undefined && (typeof row.cursor !== 'string' || !/^[a-f0-9]{48}$/.test(row.cursor)))) throw new HttpsError('invalid-argument', 'Invalid post selection.');
  return row as SocialPostListInput;
}

/** Bounded candidate pages retain opaque cursors even when all candidates are
 * denied. Neither a saved reference nor a tag grants access to post contents. */
export async function readSocialPostListPage(db: Firestore, uid: string, raw: unknown, nowMs = Date.now()) {
  const input = normalizeSocialPostListInput(raw, uid);
  const selection = { scope: input.scope, targetId: input.targetId ?? null, search: input.search ?? null, since: input.since ?? null, contentType: input.contentType ?? null };
  const cursorId = randomBytes(24).toString('hex');
  return db.runTransaction(async tx => {
    const viewer = await resolveIdentity(db, tx, uid);
    if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId) throw new HttpsError('failed-precondition', 'Your profile changed. Reopen these posts.');
    const target = input.scope === 'profile' || input.scope === 'tagged' ? await resolveIdentity(db, tx, input.targetId!) : null;
    const empty = { ownerUid: uid, viewerProfileId: viewer.profileId, selection, posts: [], unavailableSavedPostIds: [], nextCursor: null };
    if ((input.scope === 'profile' || input.scope === 'tagged') && !target) return empty;
    if (input.scope === 'tagged') {
      const targetAdmission = await authorAdmission(db, tx, viewer, target!.profileId);
      if (!targetAdmission || !targetAdmission.allows(targetAdmission.settings.posts)) return empty;
    }
    const collection = input.scope === 'saved' ? 'bookmarks' : input.scope === 'tagged' ? 'post_user_tags' : 'posts';
    let query = db.collection(collection).orderBy('created_at', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (input.scope === 'profile') query = query.where('author_id', 'in', target!.aliases);
    if (input.scope === 'saved') query = query.where('user_id', 'in', viewer.aliases);
    if (input.scope === 'tagged') query = query.where('tagged_user_id', 'in', target!.aliases);
    if (input.scope === 'sound' || input.scope === 'filter') query = query.where(`${input.scope}_id`, '==', input.targetId);
    if (input.scope === 'recent') query = query.where('created_at', '>=', input.since);
    if (input.contentType && collection === 'posts') query = query.where('type', '==', input.contentType);
    if (input.cursor) {
      const cursor = (await tx.get(db.collection('_social_post_list_cursors').doc(input.cursor))).data();
      if (!cursor || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId || cursor.version !== 1
        || Object.entries(selection).some(([key, value]) => cursor.selection?.[key] !== value) || !(cursor.expires_at instanceof Timestamp) || cursor.expires_at.toMillis() <= nowMs
        || !validPostDocumentId(cursor.document_id) || !Object.hasOwn(cursor, 'created_at')) throw new HttpsError('failed-precondition', 'This post page expired. Refresh and retry.');
      query = query.startAfter(cursor.created_at, cursor.document_id);
    }
    const candidates = await tx.get(query.limit(input.scope === 'search' ? 101 : 21));
    const rawCandidates = candidates.docs.slice(0, input.scope === 'search' ? 100 : 20);
    // Existing profile pins remain first even when their posts are old. They
    // are admitted independently and deduplicated against ordinary pages.
    const pins = input.scope === 'profile' && !input.cursor
      ? (await tx.get(db.collection('posts').where('author_id', 'in', target!.aliases).where('is_pinned', '==', true).limit(3))).docs : [];
    const admissions = new Map<string, ReturnType<typeof authorAdmission>>();
    const posts: NonNullable<ReturnType<typeof projectPost>>[] = [];
    const unavailableSavedPostIds: string[] = [];
    const seen = new Set<string>();
    let last: QueryDocumentSnapshot | undefined;
    for (const candidate of [...pins, ...rawCandidates]) {
      if (rawCandidates.includes(candidate)) last = candidate;
      const reference = candidate.data();
      const postId = collection === 'posts' ? candidate.id : reference.post_id;
      if (!validPostDocumentId(postId) || seen.has(postId)) continue;
      seen.add(postId);
      const row = collection === 'posts' ? reference : (await tx.get(db.collection('posts').doc(postId))).data();
      let projected: ReturnType<typeof projectPost> = null;
      if (row && validAudienceId(row.author_id) && (!input.contentType || row.type === input.contentType)) {
        const search = input.search?.toLowerCase();
        if (search && !(typeof row.caption === 'string' && row.caption.toLowerCase().includes(search))
          && !(Array.isArray(row.tags) && row.tags.some(tag => typeof tag === 'string' && tag.toLowerCase().includes(search.replace(/^#/, ''))))) continue;
        if (!admissions.has(row.author_id)) admissions.set(row.author_id, authorAdmission(db, tx, viewer, row.author_id));
        const admission = await admissions.get(row.author_id)!;
        if (admission && (row.user_id === undefined || admission.author.aliases.includes(row.user_id))) projected = projectPost(postId, row, admission);
      }
      if (projected) posts.push(projected);
      else if (input.scope === 'saved') unavailableSavedPostIds.push(postId);
      if (input.scope === 'search' && posts.length === 20) break;
    }
    const reactions = new Map<string, string>(); const saved = new Set<string>();
    if (posts.length) for (const alias of viewer.aliases) {
      const ids = posts.map(post => post.id);
      const [likes, bookmarks] = await Promise.all([
        tx.get(db.collection('likes').where('user_id', '==', alias).where('post_id', 'in', ids).limit(101)),
        tx.get(db.collection('bookmarks').where('user_id', '==', alias).where('post_id', 'in', ids).limit(101)),
      ]);
      if (likes.size > 100 || bookmarks.size > 100) throw new HttpsError('resource-exhausted', 'Post interactions need repair. Please contact support.');
      for (const like of likes.docs) reactions.set(like.data().post_id, ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'].includes(like.data().reaction_type) ? like.data().reaction_type : 'like');
      for (const bookmark of bookmarks.docs) saved.add(bookmark.data().post_id);
    }
    let nextCursor: string | null = null;
    if (last && (candidates.size > rawCandidates.length || last.id !== rawCandidates.at(-1)?.id)) {
      tx.create(db.collection('_social_post_list_cursors').doc(cursorId), { version: 1, owner_uid: uid, profile_id: viewer.profileId,
        selection, document_id: last.id, created_at: last.data().created_at, expires_at: Timestamp.fromMillis(nowMs + 600000) });
      nextCursor = cursorId;
    }
    return { ...empty, posts: posts.map(post => ({ ...post, reactionType: reactions.get(post.id) ?? null, isBookmarked: saved.has(post.id) })), unavailableSavedPostIds, nextCursor };
  });
}
