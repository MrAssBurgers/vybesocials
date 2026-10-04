import { db } from '@/lib/firebase';

function failure(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}

/** The compatibility client resolves failed writes as { error }, not rejections. */
export async function saveMusicPersonality(profileId: string, personality: string) {
  const { data, error } = await db.from('profiles').update({ music_personality: personality }).eq('id', profileId);
  if (error) throw failure(error, 'Your music result could not be saved. Try again.');
  if (!Array.isArray(data) || !data.some(row => row.id === profileId)) throw new Error('Your music result was not saved. Reopen your profile and try again.');
}

export async function publishMusicPost(post: { author_id: string; type: 'post'; caption: string; media_url?: string }) {
  const { data, error } = await db.from('posts').insert(post).select().single();
  if (error) throw failure(error, 'Your post could not be shared. Try again.');
  if (!data || typeof data.id !== 'string' || !data.id || data.author_id !== post.author_id) throw new Error('Your post was not confirmed. Check your feed before trying again.');
  return data.id;
}

/** Optional counters never turn a successful publish/play into a failure. */
export async function recordMusicUsage(trackId: string, kind: 'plays' | 'shares'): Promise<boolean> {
  try {
    const result = await db.rpc('update_track_usage', { p_track_id: trackId, [`p_${kind}`]: 1 });
    return !result.error && result.data !== null;
  } catch { return false; }
}
