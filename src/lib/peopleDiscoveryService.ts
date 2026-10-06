import { z } from 'zod';
import { getFirebaseAuth } from './firebase/authService';
import { invokeFunction } from './firebase/functionsService';
import { profileAccountGuard } from './profileAccountGuard';

const id = z.string().min(1).max(128).refine(value => !value.includes('/') && value !== '.' && value !== '..');
const stamp = z.number().int().positive();
const profileSchema = z.object({
  id, username: z.string().max(100).refine(value => !!value.trim()), display_name: z.string().max(200).nullable(),
  avatar_url: z.string().max(8192).url().refine(value => value.startsWith('https://')).nullable(),
  interests: z.array(z.string().max(100)).max(30),
}).strict();
const receiptSchema = z.object({ ok: z.literal(true), ownerUid: id, profileId: id, accountCreatedAt: stamp,
  serverTime: stamp, leaseUntil: stamp, ageReviewRequired: z.boolean(), profiles: z.array(profileSchema).max(30) }).strict();
const inputSchema = z.object({ limit: z.number().int().min(1).max(120).optional(), candidateIds: z.array(id).max(120).optional() }).strict();
export type DiscoveryProfile = z.infer<typeof profileSchema>;
export type DiscoverySelection = z.infer<typeof inputSchema>;
export type DiscoveryActor = { uid: string; profileId: string };
export type DiscoveryResult = { profiles: DiscoveryProfile[]; ageReviewRequired: boolean; validUntil: number };

/** Checked, ephemeral suggestions. No raw read or persisted fallback. */
export async function readPeopleDiscovery(actor: DiscoveryActor, selection: DiscoverySelection, extraGuard: () => void): Promise<DiscoveryResult> {
  const guard = profileAccountGuard(actor.uid, extraGuard), user = getFirebaseAuth()?.currentUser;
  const created = Date.parse(user?.metadata.creationTime || '');
  const input = inputSchema.safeParse(selection);
  if (!user || user.uid !== actor.uid || !id.safeParse(actor.profileId).success || !stamp.safeParse(created).success || !input.success) {
    throw new Error('Sign in and choose a valid suggestion selection.');
  }
  let active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { guard(); if (!active || getFirebaseAuth()?.currentUser !== user) throw new Error('This suggestion request has ended. Please retry.'); };
  const invalid = () => Object.assign(new Error('Suggestions could not be confirmed. Please retry.'), { code: 'invalid-response' });
  try {
    current();
    return await Promise.race([
      (async () => {
        const started = performance.now();
        const result = await invokeFunction<unknown>('getDiscoveryProfiles', { ...input.data,
          expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, expectedAccountCreatedAt: created });
        current();
        if (result.error) throw Object.assign(new Error(result.error.message || 'Suggestions are unavailable. Please retry.'), { code: result.error.code || result.error.name || 'unavailable' });
        const parsed = receiptSchema.safeParse(result.data); if (!parsed.success) throw invalid();
        const row = parsed.data, limit = input.data.limit ?? 120;
        const allowed = input.data.candidateIds === undefined ? null : new Set([...new Set(input.data.candidateIds)].slice(0, limit));
        if (row.ownerUid !== actor.uid || row.profileId !== actor.profileId || row.accountCreatedAt !== created
          || row.leaseUntil <= row.serverTime || row.leaseUntil > row.serverTime + 15_000
          || row.profiles.length > limit || (row.ageReviewRequired && row.profiles.length !== 0)
          || new Set(row.profiles.map(profile => profile.id)).size !== row.profiles.length
          || row.profiles.some(profile => profile.id === actor.profileId || (allowed && !allowed.has(profile.id)))) throw invalid();
        const validUntil = Date.now() + row.leaseUntil - row.serverTime - Math.max(0, performance.now() - started);
        if (validUntil <= Date.now()) throw Object.assign(new Error('Suggestion access expired while checking. Please retry.'), { code: 'deadline-exceeded' });
        return { profiles: row.profiles, ageReviewRequired: row.ageReviewRequired, validUntil };
      })(),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
        active = false; reject(Object.assign(new Error('Suggestions took too long. Please retry.'), { code: 'deadline-exceeded' }));
      }, 15_000); }),
    ]);
  } finally { active = false; if (timer) clearTimeout(timer); }
}
