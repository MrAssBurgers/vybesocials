import { db } from '@/lib/firebase';
import {
  deleteDocument,
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

/** Remove every like row for this user+post (handles legacy random doc ids). */
export async function removePostReaction(userId: string, postId: string): Promise<void> {
  const rows = await getDocuments<{ id?: string }>('likes', [
    where('user_id', '==', userId),
    where('post_id', '==', postId),
    firestoreLimit(20),
  ]);
  await Promise.all(
    rows.map((row) => (row.id ? deleteDocument('likes', row.id) : Promise.resolve())),
  );
}

/** Persist reaction + tag post mood + record ranking signal. */
export async function savePostReaction(params: {
  userId: string;
  postId: string;
  reactionType: ReactionType;
}): Promise<void> {
  const { userId, postId, reactionType } = params;
  const docId = likeDocId(userId, postId);
  const now = new Date().toISOString();

  const existing = await getDocuments<{ id?: string; created_at?: string }>('likes', [
    where('user_id', '==', userId),
    where('post_id', '==', postId),
    firestoreLimit(20),
  ]).catch(() => [] as { id?: string; created_at?: string }[]);

  const createdAt = existing.find((r) => r.created_at)?.created_at || now;
  for (const row of existing) {
    if (row.id && row.id !== docId) {
      await deleteDocument('likes', row.id);
    }
  }

  await setDocument('likes', docId, {
    id: docId,
    user_id: userId,
    post_id: postId,
    reaction_type: reactionType,
    created_at: createdAt,
    updated_at: now,
  });

  try {
    await bumpPostMoodSignal(postId, reactionType);
  } catch (err) {
    console.warn('[postReactions] mood signal skipped:', err);
  }
  await recordReactionRankingSignal(userId, postId, reactionType);
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
}
