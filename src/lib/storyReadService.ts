import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { Story } from '@/hooks/useStories';
const nullableString = z.string().nullable();
const story = z.object({
  id: z.string().min(1).max(200), author_id: z.string().min(1).max(128),
  media_url: z.string().min(1).max(8192), media_type: z.enum(['image', 'video']), thumbnail_url: nullableString.optional(),
  caption: nullableString, is_close_friends_only: z.boolean(), view_count: z.number().finite().nonnegative(),
  expires_at: z.string().datetime(), created_at: z.string().datetime(), aspect_ratio: z.number().finite().optional(), duration: z.number().finite().nullable().optional(),
  author: z.object({ id: z.string().min(1), username: z.string(), avatar_url: nullableString, display_name: nullableString, equipped_profile_theme: nullableString.optional() }),
  poll_data: z.object({ type: z.enum(['poll', 'question']), question: z.string(), options: z.array(z.string()) }).nullable().optional(),
});
const response = z.object({ success: z.literal(true), ownerUid: z.string(), profileId: z.string(), stories: z.array(story).max(1000), nextCursor: z.string().min(1).max(1024).nullable() });
export interface StoryReadRequest { expectedOwnerUid: string; expectedProfileId: string; cursor?: string; authorId?: string; storyIds?: string[] }
export async function listVisibleStories(request: StoryReadRequest, guard: () => void): Promise<{ stories: Story[]; nextCursor: string | null }> {
  guard();
  const input = { ...request, ...(request.storyIds ? { storyIds: [...request.storyIds] } : {}) };
  const result = await invokeFunction<unknown>('listVisibleStories', input);
  guard();
  if (result.error) throw Object.assign(new Error('Stories could not be loaded. Check your connection and try again.'), { code: result.error.code || result.error.name });
  const checked = response.safeParse(result.data);
  if (!checked.success || checked.data.ownerUid !== input.expectedOwnerUid || checked.data.profileId !== input.expectedProfileId
    || checked.data.stories.some(row => row.author.id !== row.author_id)) throw new Error('Story access could not be verified. Please retry.');
  if ((input.authorId || input.storyIds) && checked.data.nextCursor !== null) throw new Error('Story access could not be verified. Please retry.');
  if (input.storyIds && (checked.data.stories.length > 50 || checked.data.stories.some(row => !input.storyIds!.includes(row.id)))) throw new Error('The story response did not match this selection.');
  if (input.authorId && (checked.data.stories.length > 100 || checked.data.stories.some(row => row.author_id !== input.authorId))) throw new Error('The story response did not match this profile.');
  if (input.cursor && checked.data.nextCursor === input.cursor) throw new Error('Story pagination could not advance. Please retry.');
  return { stories: checked.data.stories as Story[], nextCursor: checked.data.nextCursor };
}
