/**
 * Plain (non-hook) story creation for the snap send pipeline — mirrors the
 * useCreateStory mutation so a story destination can be delivered from the
 * background send service. Callers invalidate the ['stories'] query afterwards.
 */
import { publishStory } from '@/lib/storyPublishService';
import { resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';
import type { StoryDestinationId } from '@/lib/camera/recipientSelection';
import { reportAccountGuard } from '@/lib/reportModerationService';

export interface CreateStoryRecordParams {
  requestId: string;
  expectedOwnerUid: string;
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
  requestId,
  expectedOwnerUid,
  mediaUrl,
  mediaType,
  thumbnailUrl,
  caption,
  durationSec,
  destination,
  authorId: boundAuthorId,
  accountGuard = reportAccountGuard(expectedOwnerUid),
}: CreateStoryRecordParams): Promise<void> {
  accountGuard();
  if (!storyDestinationSupported(destination)) {
    throw new Error('This story audience is not available yet');
  }

  const authorId = boundAuthorId || await resolveStoryAuthorProfileId();
  accountGuard();

  const result = await publishStory({
    requestId, expectedOwnerUid, authorId, accountGuard,
    mediaUrl, mediaType: mediaType === 'video' ? 'video' : 'image', thumbnailUrl,
    caption, isCloseFriendsOnly: destination === 'close_friends', aspectRatio: 0.5625, duration: durationSec ?? null,
  });
  accountGuard();
  if (result.created) recordChallengeActivity(authorId, 'story');
}
