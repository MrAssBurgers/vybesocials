/**
 * Plain (non-hook) story creation for the snap send pipeline — mirrors the
 * useCreateStory mutation so a story destination can be delivered from the
 * background send service. Callers invalidate the ['stories'] query afterwards.
 */
import { db } from '@/lib/firebase';
import { resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';
import type { StoryDestinationId } from '@/lib/camera/recipientSelection';
import { reportAccountGuard } from '@/lib/reportModerationService';

export interface CreateStoryRecordParams {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  thumbnailUrl?: string | null;
  caption?: string;
  durationSec?: number | null;
  destination: StoryDestinationId;
  /** Verified once by the bound snap job; never resolve a newer account's author. */
  authorId?: string;
  accountGuard?: () => void;
}

/**
 * Backend support today: my_story + close_friends (is_close_friends_only flag).
 * custom:/group: destinations have no schema support — they are surfaced as
 * disabled options in the UI and rejected here so callers fail loudly.
 */
export function storyDestinationSupported(destination: StoryDestinationId): boolean {
  return destination === 'my_story' || destination === 'close_friends';
}

export async function createStoryRecord({
  mediaUrl,
  mediaType,
  thumbnailUrl,
  caption,
  durationSec,
  destination,
  authorId: boundAuthorId,
  accountGuard = reportAccountGuard(),
}: CreateStoryRecordParams): Promise<void> {
  accountGuard();
  if (!storyDestinationSupported(destination)) {
    throw new Error('This story audience is not available yet');
  }

  const authorId = boundAuthorId || await resolveStoryAuthorProfileId();
  accountGuard();

  const payload = {
    author_id: authorId,
    media_url: mediaUrl,
    media_type: mediaType === 'video' ? 'video' : 'image',
    thumbnail_url: thumbnailUrl || null,
    caption: caption || null,
    is_close_friends_only: destination === 'close_friends',
    aspect_ratio: 0.5625,
    duration: durationSec ?? null,
    poll_data: null,
    view_count: 0,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const { error } = await (db.from('stories') as any).insert(payload);
  accountGuard();
  if (error) {
    const msg = error.message || '';
    if (/row-level security|policy|42501/i.test(msg)) {
      throw new Error('Story blocked by permissions. Sign out and back in, then try again.');
    }
    throw new Error(msg || 'Failed to post story');
  }

  recordChallengeActivity(authorId, 'story');
}
