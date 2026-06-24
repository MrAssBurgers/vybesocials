import { db } from '@/lib/firebase';
import {
  deleteDocument,
  getDocument,
  getDocuments,
  setDocument,
  where,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import type { ReactionType } from '@/lib/reactions';
import { getFeedMoodForReaction } from '@/lib/reactionMoods';

export function likeDocId(userId: string, postId: string): string {
  return `${userId}_${postId}`;
}

export function postMoodSignalDocId(postId: string, mood: string): string {
  return `${postId}_${mood}`;
}

export function resolveLikeUserIds(profileId: string, authUid?: string | null): string[] {
  return [...new Set([profileId, authUid].filter(Boolean))] as string[];
}

function isMissingDocError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found|NOT_FOUND|No document to update/i.test(msg);
}

async function safeDeleteLike(id: string): Promise<void> {
  try {
    await deleteDocument('likes', id);
  } catch (err) {
    if (!isMissingDocError(err)) throw err;
  }
}

async function findLikeRows(
  userIds: string[],
  postId: string,
): Promise<Array<{ id?: string; created_at?: string; user_id?: string }>> {
  const merged = new Map<string, { id?: string; created_at?: string; user_id?: string }>();

  for (const uid of userIds) {
    const byDoc = await getDocument<{ id?: string; created_at?: string; user_id?: string }>(
      'likes',
      likeDocId(uid, postId),
    );
    if (byDoc?.id) merged.set(byDoc.id, byDoc);

    const rows = await getDocuments<{ id?: string; created_at?: string; user_id?: string }>('likes', [
      where('user_id', '==', uid),
      where('post_id', '==', postId),
      firestoreLimit(20),
    ]).catch(() => []);

    for (const row of rows) {
      if (row.id) merged.set(row.id, row);
    }
  }

  return [...merged.values()];
}

/** Remove every like row for this user+post (handles legacy random doc ids). */
export async function removePostReaction(
  userId: string,
  postId: string,
  authUid?: string | null,
): Promise<void> {
  const userIds = resolveLikeUserIds(userId, authUid);
  const rows = await findLikeRows(userIds, postId);
  const ids = new Set<string>();

  for (const uid of userIds) ids.add(likeDocId(uid, postId));
  for (const row of rows) {
    if (row.id) ids.add(row.id);
  }

  await Promise.all([...ids].map((id) => safeDeleteLike(id)));
}

/** Best-effort like notification — never blocks the reaction write. */
export async function notifyPostLike(params: {
  recipientId: string;
  actorId: string;
  postId: string;
}): Promise<void> {
  const { recipientId, actorId, postId } = params;
  if (!recipientId || recipientId === actorId) return;

  const { error } = await db.from('notifications').insert({
    user_id: recipientId,
    type: 'like',
    actor_id: actorId,
    post_id: postId,
  });

  if (error) {
    console.warn('[postReactions] like notification skipped:', error.message);
  }
}

/** Persist reaction + tag post mood + record ranking signal. */
export async function savePostReaction(params: {
  userId: string;
  postId: string;
  reactionType: ReactionType;
  authUid?: string | null;
}): Promise<void> {
  const { userId, postId, reactionType, authUid } = params;
  if (!userId || !postId) throw new Error('Missing user or post id');

  const userIds = resolveLikeUserIds(userId, authUid);
  const docId = likeDocId(userId, postId);
  const now = new Date().toISOString();
  const existing = await findLikeRows(userIds, postId);
  const createdAt = existing.find((r) => r.created_at)?.created_at || now;

  await setDocument('likes', docId, {
    id: docId,
    user_id: userId,
    post_id: postId,
    reaction_type: reactionType,
    created_at: createdAt,
    updated_at: now,
  });

  for (const row of existing) {
    if (row.id && row.id !== docId) {
      await safeDeleteLike(row.id);
    }
  }

  for (const uid of userIds) {
    const legacyId = likeDocId(uid, postId);
    if (legacyId !== docId) {
      await safeDeleteLike(legacyId);
    }
  }

  try {
    await bumpPostMoodSignal(postId, reactionType);
  } catch (err) {
    console.warn('[postReactions] mood signal skipped:', err);
  }
  await recordReactionRankingSignal(userId, postId, reactionType);
}

/** Top reaction emojis on a post (Facebook-style summary). */
export async function getPostTopReactions(
  postId: string,
  limit = 3,
): Promise<ReactionType[]> {
  if (!postId) return [];

  const rows = await getDocuments<{ reaction_type?: string }>('likes', [
    where('post_id', '==', postId),
    firestoreLimit(200),
  ]);

  const counts = new Map<ReactionType, number>();
  for (const row of rows) {
    const t = (row.reaction_type as ReactionType) || 'like';
    counts.set(t, (counts.get(t) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type]) => type);
}

/** Load the signed-in viewer's reaction on a post (profile id + auth uid). */
export async function getViewerPostReaction(
  postId: string,
  profileId: string,
  authUid?: string | null,
): Promise<{ is_liked: boolean; reaction_type: ReactionType | null }> {
  const rows = await findLikeRows(resolveLikeUserIds(profileId, authUid), postId);
  if (!rows.length) return { is_liked: false, reaction_type: null };
  const raw = (rows[0] as any)?.reaction_type as ReactionType | undefined;
  return { is_liked: true, reaction_type: raw ?? 'like' };
}

async function bumpPostMoodSignal(postId: string, reactionType: ReactionType): Promise<void> {
  const mood = getFeedMoodForReaction(reactionType);
  const signalId = postMoodSignalDocId(postId, mood);
  const now = new Date().toISOString();
  let prevStrength = 0;
  let prevCreatedAt: string | undefined;

  try {
    const existing = await getDocuments<{ signal_strength?: number; created_at?: string }>(
      'post_mood_signals',
      [where('post_id', '==', postId), where('mood', '==', mood), firestoreLimit(1)],
    );
    prevStrength = Number(existing[0]?.signal_strength ?? 0);
    prevCreatedAt = existing[0]?.created_at;
  } catch {
    /* non-fatal */
  }

  await setDocument('post_mood_signals', signalId, {
    id: signalId,
    post_id: postId,
    mood,
    signal_strength: prevStrength + 1,
    created_at: prevCreatedAt || now,
  });
}

async function recordReactionRankingSignal(
  userId: string,
  postId: string,
  reactionType: ReactionType,
): Promise<void> {
  try {
    const interactionId = `${userId}_${postId}_react_${reactionType}`;
    await db.from('user_interactions').upsert(
      {
        id: interactionId,
        user_id: userId,
        post_id: postId,
        interaction_type: `react_${reactionType}`,
        duration_seconds: 0,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,post_id,interaction_type' },
    );
  } catch (err) {
    console.warn('[postReactions] ranking signal skipped:', err);
  }
}

/** Patch react query caches so the chosen emoji survives refetches. */
export function patchReactionInFeedCaches(
  queryClient: import('@tanstack/react-query').QueryClient,
  postId: string,
  reactionType: ReactionType | null,
): void {
  const patchPost = (p: Record<string, unknown> | null | undefined) => {
    if (!p || p.id !== postId) return p;
    return {
      ...p,
      is_liked: reactionType !== null,
      reaction_type: reactionType,
    };
  };

  const patchList = (data: unknown) => {
    if (!Array.isArray(data)) return data;
    return data.map((p) => patchPost(p as Record<string, unknown>));
  };

  const patchInfinite = (data: unknown) => {
    if (!data || typeof data !== 'object') return data;
    const pages = (data as { pages?: Array<{ posts?: unknown[] }> }).pages;
    if (!pages) return data;
    return {
      ...data,
      pages: pages.map((page) => ({
        ...page,
        posts: Array.isArray(page.posts)
          ? page.posts.map((p) => patchPost(p as Record<string, unknown>))
          : page.posts,
      })),
    };
  };

  queryClient.setQueriesData({ queryKey: ['posts'] }, patchList);
  queryClient.setQueriesData({ queryKey: ['ranked-feed-v2'] }, patchInfinite);
  queryClient.setQueriesData({ queryKey: ['personalized-feed'] }, patchInfinite);
  queryClient.setQueriesData({ queryKey: ['infinite-posts'] }, patchInfinite);
  queryClient.setQueriesData({ queryKey: ['infinite-following'] }, patchInfinite);
  queryClient.setQueriesData({ queryKey: ['clips-viewer-feed'] }, patchInfinite);
  queryClient.setQueriesData({ queryKey: ['clip-viewer-initial'] }, (data) => patchPost(data as Record<string, unknown>));
}
