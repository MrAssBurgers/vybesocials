import { changePostComment, type CommentChange } from './commentService';
import { tokenAccountSnapshot, type TokenAccountGuard } from './tokenMarketplaceService';
const attempts = new Map<string, string>();
export async function saveCommentChange(change: CommentChange & { postId: string }, profileId: string, guard: TokenAccountGuard) {
  guard(); const session = tokenAccountSnapshot();
  if (!session.uid) throw new Error('Not authenticated');
  const identity = { expectedOwnerUid: session.uid, expectedProfileId: profileId };
  const key = JSON.stringify([identity, session.epoch, change]);
  let requestId = attempts.get(key);
  if (!requestId) { requestId = crypto.randomUUID(); attempts.set(key, requestId); }
  while (attempts.size > 64) attempts.delete(attempts.keys().next().value!);
  const receipt = await changePostComment({ ...identity, ...change, requestId }, guard);
  attempts.delete(key);
  return receipt;
}
export async function changeComment(input: { commentId: string; postId: string; action: 'edit' | 'delete'; text?: string; expectedRevision?: string | null }, profileId: string, guard: TokenAccountGuard) {
  const change = input.action === 'edit'
    ? { action: 'edit' as const, commentId: input.commentId, postId: input.postId, expectedRevision: input.expectedRevision ?? null, text: input.text! }
    : { action: 'delete' as const, commentId: input.commentId, postId: input.postId, expectedRevision: input.expectedRevision ?? null };
  const receipt = await saveCommentChange(change, profileId, guard);
  return { postId: receipt.postId, guard };
}
