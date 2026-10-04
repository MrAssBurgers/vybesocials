import { z } from 'zod';
import { invokeFunction } from './firebase/functionsService';
import { validLocalArea, type LocalArea } from './localArea';
const receipt = z.object({ ownerUid: z.string(), profileId: z.string(), postId: z.string(), action: z.enum(['state', 'share', 'remove']),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), enabled: z.boolean() }).strict();
export type PostLocalReceipt = z.infer<typeof receipt>;
type Input = { expectedOwnerUid: string; expectedProfileId: string; postId: string } &
  ({ action: 'state' } | { action: 'share'; revision: number; area: LocalArea } | { action: 'remove'; revision: number });
export async function managePostLocalArea(input: Input, guard: () => void): Promise<PostLocalReceipt> {
  guard();
  if (input.action === 'share' && !validLocalArea(input.area)) throw new Error('Choose an approximate area before sharing.');
  const response = await invokeFunction<unknown>('managePostLocalArea', input); guard();
  if (response.error) throw new Error(response.error.message || 'Local sharing could not be confirmed. Reopen this post to try again.');
  const result = receipt.parse(response.data);
  if (result.ownerUid !== input.expectedOwnerUid || result.profileId !== input.expectedProfileId || result.postId !== input.postId || result.action !== input.action
    || (input.action !== 'state' && (result.revision !== input.revision + 1 || result.enabled !== (input.action === 'share')))) throw new Error('Local sharing could not be verified. Reopen this post.');
  return result;
}
