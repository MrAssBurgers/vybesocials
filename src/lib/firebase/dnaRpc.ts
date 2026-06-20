import { getDocuments, setDocument, where, firestoreLimit } from './firestoreDb';
import { firebaseAuth } from './authService';
import { resolveProfileIdFromAuthUid } from './profileResolve';

/** Client-side compute_vybe_dna — avoids Cloud Function CORS noise on vybehub.app. */
export async function rpcComputeVybeDna(): Promise<Record<string, number>> {
  const { data: { user } } = await firebaseAuth.getUser();
  if (!user?.id) throw new Error('Not authenticated');

  const profileId = (await resolveProfileIdFromAuthUid(user.id)) || user.id;
  const ownerIds = [...new Set([profileId, user.id])];

  const countFor = async (table: string, field: string, value: string) => {
    const rows = await getDocuments<Record<string, unknown>>(table, [
      where(field, '==', value),
      firestoreLimit(500),
    ]);
    return rows.length;
  };

  let postCount = 0;
  let likeCount = 0;
  let commentCount = 0;
  for (const id of ownerIds) {
    postCount += await countFor('posts', 'author_id', id);
    likeCount += await countFor('likes', 'user_id', id);
    commentCount += await countFor('comments', 'author_id', id);
  }

  const tanhNorm = (raw: number, scale: number) =>
    (Math.tanh(raw / scale - 0.5) + 1) / 2;

  const creative = tanhNorm(Math.log(Math.max(postCount, 1) + 1), 4);
  const social = tanhNorm(Math.log(Math.max(likeCount + commentCount, 1) + 1), 5);
  const activity = tanhNorm(Math.log(Math.max(likeCount + commentCount + postCount, 1) + 1), 5);

  const personality = {
    activity: Math.round(activity * 1000) / 1000,
    social: Math.round(social * 1000) / 1000,
    creative: Math.round(creative * 1000) / 1000,
  };

  const now = new Date().toISOString();
  await setDocument('vybe_dna', profileId, {
    id: profileId,
    user_id: profileId,
    personality_vector: personality,
    aura_intensity: Math.round(((activity + social + creative) / 3) * 1000) / 1000,
    updated_at: now,
    generated_at: now,
  });

  return personality;
}
