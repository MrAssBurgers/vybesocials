import { reportAccountGuard, reportAccountSnapshot } from './reportModerationService';
import { managePost } from './postMutationService';
import { legacyPostFromReceipt, postPayloadFromLegacy, preparePostCreate, submitPreparedPost } from './postCreateAttempts';
function actorFor(captureId: string, profileId: string, extraGuard?: () => void) {
  if (!/^[a-f0-9]{48}$/.test(captureId)) throw new Error('Invalid game capture.');
  const uid = reportAccountSnapshot().uid || '', account = reportAccountGuard(uid);
  const guard = () => { account(); extraGuard?.(); };
  guard(); return { actor: { uid, profileId }, guard, postId: 'game_' + captureId };
}
/** A missing document is checked by the server; raw missing-post reads are denied. */
export async function findGameCapturePost(captureId: string, authorId: string, extraGuard?: () => void) {
  const { actor, guard, postId } = actorFor(captureId, authorId, extraGuard);
  const state = await managePost(actor, { action: 'read', postId }, guard); guard();
  if (state.status === 'missing') return null;
  if (state.status === 'deleted') throw new Error('This capture publication was removed. It cannot be restored by retrying.');
  if (state.status !== 'published' || state.post?.gameCaptureId !== captureId) throw new Error('This capture publication needs an explicit owner review.');
  return legacyPostFromReceipt(state);
}
/** Compatibility entry point; the server alone writes the post and capture receipt. */
export async function saveGameCapturePost(captureId: string, authorId: string, payload: Record<string, unknown>, extraGuard?: () => void) {
  const { actor, guard, postId } = actorFor(captureId, authorId, extraGuard);
  const attempt = preparePostCreate(actor, postId, { ...postPayloadFromLegacy(payload), gameCaptureId: captureId });
  const state = await submitPreparedPost(attempt, guard);
  return { post: legacyPostFromReceipt(state), created: state.created };
}
