import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
const id = z.string().min(1).max(128);
const relationshipId = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const actor = { ownerUid: id, profileId: id };
const receipt = z.object({ ...actor, action: z.enum(['state', 'request', 'approve', 'decline', 'remove', 'unfollow']),
  relationshipId, revision, state: z.enum(['none', 'pending', 'following']), targetId: id, privateAccount: z.boolean(), blocked: z.boolean() }).strict();
const list = z.object({ ...actor, action: z.literal('list'), view: z.enum(['requests', 'followers']),
  relationships: z.array(z.object({ relationshipId, revision, status: z.enum(['pending', 'active']), approvedByOwner: z.boolean(), canApprove: z.boolean(),
    follower: z.object({ id, username: z.string().max(128), displayName: z.string().max(200).nullable() }).strict() }).strict()).max(20),
  nextCursor: relationshipId.nullable() }).strict();
export type FollowReceipt = z.infer<typeof receipt>;
export type FollowList = z.infer<typeof list>;
export type FollowActor = { expectedOwnerUid: string; expectedProfileId: string };
export type FollowWrite = { action: 'request'; targetId: string; revision: number }
  | { action: 'approve' | 'decline' | 'remove' | 'unfollow'; relationshipId: string; revision: number };
function parseReceipt(value: unknown) {
  const parsed = receipt.safeParse(value);
  if (!parsed.success || (parsed.data.blocked && parsed.data.state !== 'none')) throw new Error('Follow status could not be verified. Refresh and retry.');
  return parsed.data;
}
async function invoke(input: FollowActor & Record<string, unknown>, guard: () => void) {
  guard(); const response = await invokeFunction<unknown>('manageFollow', input); guard();
  if (response.error) throw new Error(response.error.message || 'This follow change could not be confirmed. Refresh and retry.');
  return response.data;
}
export async function readFollowState(input: FollowActor & { targetId: string }, guard: () => void): Promise<FollowReceipt> {
  const result = parseReceipt(await invoke({ ...input, action: 'state' }, guard));
  if (result.ownerUid !== input.expectedOwnerUid || result.profileId !== input.expectedProfileId || result.action !== 'state' || result.targetId !== input.targetId) throw new Error('Follow access could not be verified.');
  return result;
}
export async function writeFollow(input: FollowActor & FollowWrite, guard: () => void): Promise<FollowReceipt> {
  const result = parseReceipt(await invoke(input, guard));
  if (result.ownerUid !== input.expectedOwnerUid || result.profileId !== input.expectedProfileId || result.action !== input.action
    || (input.action === 'request' ? result.targetId !== input.targetId || ![input.revision, input.revision + 1].includes(result.revision)
      : result.relationshipId !== input.relationshipId || result.revision !== input.revision + 1)
    || (input.action === 'approve' && result.state !== 'following')
    || (['decline', 'remove', 'unfollow'].includes(input.action) && result.state !== 'none')
    || (input.action === 'request' && result.state === 'none')) throw new Error('The follow change was not confirmed. Refresh and retry.');
  return result;
}
export async function readFollowList(input: FollowActor & { view: 'requests' | 'followers'; cursor?: string }, guard: () => void): Promise<FollowList> {
  const parsed = list.safeParse(await invoke({ ...input, action: 'list' }, guard));
  if (!parsed.success) throw new Error('Your follower list could not be verified.');
  const result = parsed.data;
  if (result.ownerUid !== input.expectedOwnerUid || result.profileId !== input.expectedProfileId || result.view !== input.view
    || (input.cursor && result.nextCursor && result.nextCursor <= input.cursor)
    || new Set(result.relationships.map(row => row.relationshipId)).size !== result.relationships.length
    || result.relationships.some(row => row.status !== (input.view === 'requests' ? 'pending' : 'active'))) throw new Error('Your follower list could not be verified.');
  return result;
}
