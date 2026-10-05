import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard, reportAccountSnapshot } from './reportModerationService';
import { resolveProfileIdFromAuthUid } from './firebase/profileResolve';
import type { PostActor } from './postMutationService';
const receipt = z.object({ ok: z.literal(true), ownerUid: z.string(), profileId: z.string(), postId: z.string(), viewCount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), counted: z.boolean() }).strict();
export async function recordPostView(actor: PostActor, postId: string, guard: () => void) {
  guard();
  const response = await invokeFunction<unknown>('recordPostView', { expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, postId });
  guard();
  if (response.error) throw new Error(response.error.message || 'This view could not be recorded.');
  const parsed = receipt.safeParse(response.data);
  if (!parsed.success || parsed.data.ownerUid !== actor.uid || parsed.data.profileId !== actor.profileId || parsed.data.postId !== postId) throw new Error('This view receipt could not be verified.');
  return parsed.data;
}
/** Legacy RPC alias still uses a captured native session and the same authority. */
export async function recordCurrentPostView(postId: string) {
  const uid = reportAccountSnapshot().uid || '', guard = reportAccountGuard(uid); guard();
  const profileId = await resolveProfileIdFromAuthUid(uid); guard();
  if (!profileId) throw new Error('Your profile is unavailable. Reopen this post.');
  return recordPostView({ uid, profileId }, postId, guard);
}
/** Presentation is changed only by an acknowledged, currently bound receipt. */
export async function applyConfirmedPostView(actor: PostActor, postId: string, guard: () => void, apply: (count: number) => void): Promise<void> {
  try { const result = await recordPostView(actor, postId, guard); guard(); apply(result.viewCount); }
  catch { /* Playback remains usable; failed telemetry does not invent a count. */ }
}
