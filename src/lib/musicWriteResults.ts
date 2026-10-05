import { db } from '@/lib/firebase';
import { reportAccountGuard, reportAccountSnapshot } from './reportModerationService';
import { listPreparedPosts, postPayloadFromLegacy, preparePostCreate, submitPreparedPost } from './postCreateAttempts';

function failure(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

/** The compatibility client resolves failed writes as { error }, not rejections. */
export async function saveMusicPersonality(profileId: string, personality: string) {
  const { data, error } = await db.from('profiles').update({ music_personality: personality }).eq('id', profileId);
  if (error) throw failure(error, 'Your music result could not be saved. Try again.');
  if (!Array.isArray(data) || !data.some(row => row.id === profileId)) throw new Error('Your music result was not saved. Reopen your profile and try again.');
}

export async function publishMusicPost(post: { author_id: string; type: 'post'; caption: string; media_url?: string }, extraGuard?: () => void) {
  const uid = reportAccountSnapshot().uid || '', account = reportAccountGuard(uid);
  const guard = () => { account(); extraGuard?.(); }; guard();
  const actor = { uid, profileId: post.author_id }, payload = postPayloadFromLegacy(post);
  const sourceKey = JSON.stringify(['music', post.author_id, payload]);
  const retained = listPreparedPosts(uid).find(row => row.actor.profileId === actor.profileId && row.sourceKey === sourceKey);
  const attempt = retained || preparePostCreate(actor, crypto.randomUUID(), payload, sourceKey);
  const result = await submitPreparedPost(attempt, guard); guard();
  return result.postId;
}

/** Optional counters never turn a successful publish/play into a failure. */
export async function recordMusicUsage(trackId: string, kind: 'plays' | 'shares'): Promise<boolean> {
  try {
    const result = await db.rpc('update_track_usage', { p_track_id: trackId, [`p_${kind}`]: 1 });
    return !result.error && result.data !== null;
  } catch { return false; }
}
