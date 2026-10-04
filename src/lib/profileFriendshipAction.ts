import { invokeFunction } from './firebase/functionsService';
import type { ReportAccountGuard } from './reportModerationService';
import { visibilityRow } from './profileVisibility';

/** No optimistic cross-account cache edits; the profile rechecks authority after acknowledgement. */
export async function profileFriendshipAction(input: { action: 'send' | 'accept' | 'decline' | 'unfriend'; targetId: string; expectedOwnerUid: string }, guard: ReportAccountGuard) {
  guard();
  let requestId: string | undefined;
  if (input.action !== 'send') {
    const result = await invokeFunction<unknown>('get-friendship-state', { target_profile_id: input.targetId }).single(); guard();
    if (result.error) throw new Error(result.error.message || 'Friendship could not be checked.');
    const expectedState = input.action === 'unfriend' ? 'accepted' : 'pending_incoming';
    if (!visibilityRow(result.data) || result.data.state !== expectedState || typeof result.data.request_id !== 'string' || !result.data.request_id || result.data.request_id.includes('/')) throw new Error('This request changed. Refresh the profile and try again.');
    requestId = result.data.request_id;
  }
  guard();
  const result = await invokeFunction<unknown>('mutate-friendship', { action: input.action, expectedOwnerUid: input.expectedOwnerUid,
    ...(requestId ? { request_id: requestId } : { target_profile_id: input.targetId }) }).single();
  guard();
  if (result.error) throw new Error(result.error.message || 'Friendship could not be updated.');
  if (!visibilityRow(result.data) || result.data.ok !== true) throw new Error('The friendship update was not confirmed. Refresh and retry.');
  return result.data;
}
