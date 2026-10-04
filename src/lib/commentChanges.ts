import { doc, runTransaction } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import type { TokenAccountGuard } from '@/lib/tokenMarketplaceService';

export type CommentChange = { commentId: string; postId: string } &
  ({ action: 'delete' } | { action: 'edit'; text: string });

/** Ownership, post identity and existence are checked in the same transaction
 * as the write. Firebase rules remain the server-side authorization boundary. */
export async function changeComment(input: CommentChange, profileId: string, guard: TokenAccountGuard) {
  guard();
  const database = getFirestoreDb();
  const reference = doc(database, 'comments', input.commentId);
  await runTransaction(database, async transaction => {
    guard();
    const snapshot = await transaction.get(reference);
    guard();
    if (!snapshot.exists()) throw new Error('This comment is no longer available.');
    const comment = snapshot.data();
    if (comment.user_id !== profileId) throw new Error('You can only change your own comments.');
    if (comment.post_id !== input.postId) throw new Error('This comment belongs to a different post.');
    if (input.action === 'delete') transaction.delete(reference);
    else transaction.update(reference, { text: input.text });
  });
  // Do not reject a committed write solely because the session changed.
  // The caller uses this guard to suppress stale UI effects instead.
  return { postId: input.postId, guard };
}
