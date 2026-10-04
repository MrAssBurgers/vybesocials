import { z } from 'zod';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { normalizeContactPhone } from '@/lib/contactDiscoveryService';
import { withTimeout } from '@/lib/withTimeout';

const id = z.string().min(1).max(128).refine(value => !value.includes('/'));
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);
const maskedPhone = z.string().regex(/^\+•••\d{4}$/);
const binding = { ok: z.literal(true), ownerUid: id, profileId: id };
const status = z.object({ ...binding, verified: z.boolean(), maskedPhone: maskedPhone.nullable(), legacyPhoneNeedsVerification: z.boolean() }).strict();
const challenge = z.object({ ...binding, challengeId: z.string().uuid(), maskedPhone, expiresAt: z.number().int().positive() }).strict();
const confirmed = z.object({ ...binding, phone, verified: z.literal(true) }).strict();
export interface PhoneVerificationActor { uid: string; profileId: string; guard: () => void }
export interface PhoneVerificationStatus { ok: true; ownerUid: string; profileId: string; verified: boolean; maskedPhone: string | null; legacyPhoneNeedsVerification: boolean }
export interface PhoneVerificationChallenge { ok: true; ownerUid: string; profileId: string; challengeId: string; maskedPhone: string; expiresAt: number }
export { PHONE_VERIFIED_EVENT } from '@/lib/phoneVerificationEvents';
export { normalizeContactPhone as normalizeVerificationPhone };

export function capturePhoneVerificationActor(uid: string, profileId: string, viewGuard: () => void): PhoneVerificationActor {
  const accountGuard = reportAccountGuard(uid);
  const guard = () => { accountGuard(); viewGuard(); if (!id.safeParse(uid).success || !id.safeParse(profileId).success) throw new Error('Wait for your signed-in profile to load.'); };
  guard(); return { uid, profileId, guard };
}
function checkIdentity(data: { ownerUid?: string; profileId?: string }, actor: PhoneVerificationActor) {
  if (data.ownerUid !== actor.uid || data.profileId !== actor.profileId) throw new Error('The phone response could not be verified. Please retry.');
}
async function request(name: string, actor: PhoneVerificationActor, payload: Record<string, unknown> = {}, signal?: AbortSignal) {
  const current = () => { actor.guard(); if (signal?.aborted) throw new DOMException('Phone request cancelled', 'AbortError'); };
  current();
  const operation = invokeFunction<unknown>(name, { ...payload, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
  // Read timeouts are safe; writes retain their receipt identity until a response.
  const result = await (name === 'phoneVerificationState' ? withTimeout(operation, 15000, 'Your phone status could not load. Please retry.') : operation);
  current();
  if (result.error) throw Object.assign(new Error(result.error.message || 'Phone verification is unavailable. Please retry.'), { code: result.error.code || result.error.name });
  return result.data;
}
export async function phoneVerificationState(actor: PhoneVerificationActor, signal?: AbortSignal): Promise<PhoneVerificationStatus> {
  const parsed = status.safeParse(await request('phoneVerificationState', actor, {}, signal));
  if (!parsed.success || (parsed.data.verified && !parsed.data.maskedPhone)) throw new Error('Your phone status could not be verified. Please retry.');
  checkIdentity(parsed.data, actor); return parsed.data as PhoneVerificationStatus;
}
export async function requestPhoneVerification(actor: PhoneVerificationActor, input: { phone: string; requestId: string }): Promise<PhoneVerificationChallenge> {
  if (!phone.safeParse(input.phone).success || normalizeContactPhone(input.phone) !== input.phone) throw new Error('Enter a valid phone number, including the country code for numbers outside the US or Canada.');
  if (!z.string().uuid().safeParse(input.requestId).success) throw new Error('Reopen phone verification and try again.');
  const parsed = challenge.safeParse(await request('phoneVerifyRequest', actor, input));
  if (!parsed.success || parsed.data.maskedPhone !== `+•••${input.phone.slice(-4)}` || parsed.data.expiresAt <= Date.now()
    || parsed.data.expiresAt > Date.now() + 86400000) throw new Error('Sending the code was not confirmed. Please retry.');
  checkIdentity(parsed.data, actor); return parsed.data as PhoneVerificationChallenge;
}
export async function confirmPhoneVerification(actor: PhoneVerificationActor, input: { challengeId: string; code: string; expectedPhone: string }) {
  if (!z.string().uuid().safeParse(input.challengeId).success || !/^\d{6}$/.test(input.code) || !phone.safeParse(input.expectedPhone).success) throw new Error('Enter the 6-digit code for this phone number.');
  const parsed = confirmed.safeParse(await request('phoneVerifyConfirm', actor, { challengeId: input.challengeId, code: input.code }));
  if (!parsed.success || parsed.data.phone !== input.expectedPhone) throw new Error('Phone verification was not confirmed. Please retry.');
  checkIdentity(parsed.data, actor);
  return parsed.data as { ok: true; ownerUid: string; profileId: string; phone: string; verified: true };
}

export function phoneVerificationFailure(error: unknown) {
  // Callable messages are safe guidance, including recent-sign-in requirements.
  return error instanceof Error && error.message ? error.message : 'Phone verification is unavailable. Please retry.';
}
