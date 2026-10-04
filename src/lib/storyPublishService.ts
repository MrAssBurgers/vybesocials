import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard } from '@/lib/reportModerationService';
import type { Story } from '@/hooks/useStories';

export interface StoryPublishParams {
  requestId: string; expectedOwnerUid: string; authorId?: string; accountGuard?: () => void;
  mediaUrl: string; mediaType: 'image' | 'video'; thumbnailUrl?: string | null; caption?: string;
  isCloseFriendsOnly?: boolean; aspectRatio?: number; duration?: number | null;
  pollData?: { type: string; question: string; options: string[] } | null;
}
export class StoryPublishError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'StoryPublishError'; }
}
const storySchema = z.object({
  id: z.string().regex(/^story_[a-f0-9]{64}$/), author_id: z.string().min(1).max(128),
  media_url: z.string().min(1).max(8192), media_type: z.enum(['image', 'video']), thumbnail_url: z.string().nullable(),
  caption: z.string().nullable(), is_close_friends_only: z.boolean(), aspect_ratio: z.number().finite(), duration: z.number().finite().nullable(),
  created_at: z.string().datetime(), expires_at: z.string().datetime(), view_count: z.number().int().nonnegative(),
  author: z.object({ id: z.string(), username: z.string(), avatar_url: z.string().nullable(), display_name: z.string().nullable() }),
  poll_data: z.object({ type: z.enum(['poll', 'question']), question: z.string(), options: z.array(z.string()) }).nullable(),
});
const receiptSchema = z.object({ success: z.literal(true), status: z.enum(['published', 'deleted', 'expired']), created: z.boolean(),
  storyId: z.string().regex(/^story_[a-f0-9]{64}$/), ownerUid: z.string(), requestId: z.string(), destination: z.enum(['my_story', 'close_friends']), story: storySchema.nullable(),
});

/** No direct-write fallback: the server receipt is the only publish authority. */
export async function publishStory(input: StoryPublishParams): Promise<{ story: Story; created: boolean }> {
  const ownGuard = reportAccountGuard(input.expectedOwnerUid);
  const guard = () => { ownGuard(); input.accountGuard?.(); };
  guard();
  const { accountGuard: _guard, ...raw } = input;
  // Snapshot caller data before any async boundary; a mutable poll object must
  // not change what a resumed request is confirmed against.
  const request = JSON.parse(JSON.stringify(raw)) as Omit<StoryPublishParams, 'accountGuard'>;
  const result = await invokeFunction<unknown>('publishStory', request as unknown as Record<string, unknown>);
  guard();
  if (result.error) {
    const code = (result.error.code || result.error.name || 'unknown').replace(/^functions\//, '');
    const message = ['not-found', 'unavailable', 'deadline-exceeded', 'internal'].includes(code)
      ? 'Story publishing could not be confirmed. Keep this draft and retry; the same request will not create a second story.'
      : result.error.message || 'Story publishing could not be confirmed. Please retry this draft.';
    throw new StoryPublishError(code, message);
  }
  const parsed = receiptSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.ownerUid !== request.expectedOwnerUid || parsed.data.requestId !== request.requestId
    || parsed.data.destination !== (request.isCloseFriendsOnly ? 'close_friends' : 'my_story')) throw new StoryPublishError('invalid-response', 'Your story receipt could not be verified. Keep this draft and retry.');
  const receipt = parsed.data;
  if (receipt.status !== 'published') {
    if (receipt.created || receipt.story !== null) throw new StoryPublishError('invalid-response', 'Your story receipt could not be verified.');
    throw new StoryPublishError(`story-${receipt.status}`, `This story was already ${receipt.status}. It has not been reposted. Create a new story draft if you want to share it again.`);
  }
  const story = receipt.story;
  const expectedPoll = request.pollData ? { type: request.pollData.type, question: request.pollData.question.trim(), options: request.pollData.options.map(option => option.trim()) } : null;
  if (!story || story.id !== receipt.storyId || story.author.id !== story.author_id || (request.authorId && story.author_id !== request.authorId)
    || story.media_url !== request.mediaUrl || story.media_type !== request.mediaType || story.thumbnail_url !== (request.thumbnailUrl || null)
    || story.caption !== (request.caption?.trim() || null) || story.is_close_friends_only !== !!request.isCloseFriendsOnly
    || story.aspect_ratio !== (request.aspectRatio ?? 0.5625) || story.duration !== (request.duration ?? null)
    || JSON.stringify(story.poll_data) !== JSON.stringify(expectedPoll)
    || Date.parse(story.expires_at) - Date.parse(story.created_at) !== 86_400_000) throw new StoryPublishError('invalid-response', 'Your story receipt did not match this draft. Keep it and retry.');
  return { story: story as Story, created: receipt.created };
}
