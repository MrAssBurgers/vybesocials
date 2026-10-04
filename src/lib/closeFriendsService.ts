import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
const identity = { success: z.literal(true), ownerUid: z.string(), profileId: z.string() };
const friend = z.object({ id: z.string().min(1).max(128), username: z.string(), avatar_url: z.string().nullable(), display_name: z.string().nullable() });
const listSchema = z.object({ ...identity, friends: z.array(z.object({ id: z.string().min(1), friend })).max(500), legacyReview: z.boolean(),
  candidates: z.array(friend).max(20), candidateNextCursor: z.string().min(1).max(1024).nullable() });
const writeSchema = z.object({ ...identity, action: z.enum(['add', 'remove']), friendId: z.string().min(1).max(128) });
export interface CloseFriendsRequest { action: 'list' | 'add' | 'remove'; expectedOwnerUid: string; expectedProfileId: string; friendId?: string }
export async function listVerifiedCloseFriends(input: Omit<CloseFriendsRequest, 'action' | 'friendId'> & { cursor?: string }, guard: () => void) {
  guard(); const result = await invokeFunction<unknown>('manageCloseFriends', { ...input, action: 'list' }); guard();
  if (result.error) throw new Error('Close friends could not be loaded. Please retry.');
  const parsed = listSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.ownerUid !== input.expectedOwnerUid || parsed.data.profileId !== input.expectedProfileId) throw new Error('Close-friends access could not be confirmed.');
  if (input.cursor && parsed.data.candidateNextCursor === input.cursor) throw new Error('The friends list could not advance. Please retry.');
  return parsed.data;
}
export async function changeVerifiedCloseFriend(input: CloseFriendsRequest & { action: 'add' | 'remove'; friendId: string }, guard: () => void) {
  guard(); const result = await invokeFunction<unknown>('manageCloseFriends', { ...input }); guard();
  if (result.error) throw new Error(result.error.message || 'Your close-friends change was not confirmed. Please retry.');
  const parsed = writeSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.ownerUid !== input.expectedOwnerUid || parsed.data.profileId !== input.expectedProfileId || parsed.data.action !== input.action || parsed.data.friendId !== input.friendId) throw new Error('Your close-friends change was not confirmed. Please retry.');
  return parsed.data;
}
