import { FieldValue } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { auth, db, enforceRateLimit, rateLimit, requireAdmin, requireAuth } from './_shared/admin.js';
import { peopleDiscovery } from './_shared/peopleDiscoveryAuthority.js';

const PROFILE_PRIVATE = 'profile_private';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function moveDateOfBirthToPrivate(
  profileId: string,
  profile: Record<string, unknown>,
): Promise<boolean> {
  const dob = asString(profile.date_of_birth);
  if (!dob) return false;

  await db.collection(PROFILE_PRIVATE).doc(profileId).set({
    profile_id: profileId,
    user_id: asString(profile.user_id) || null,
    date_of_birth: dob,
    updated_at: new Date().toISOString(),
  }, { merge: true });

  await db.collection('profiles').doc(profileId).update({
    date_of_birth: FieldValue.delete(),
    updated_at: new Date().toISOString(),
  });
  return true;
}

/** Keep newly written profile DOB out of globally readable profile documents. */
export const onProfilePrivacyWritten = onDocumentWritten(
  { document: 'profiles/{profileId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    await moveDateOfBirthToPrivate(event.params.profileId, after.data() || {});
  },
);

/**
 * Admin-only, idempotent backfill for existing profiles. It copies DOB to the
 * owner-only document before removing the public field.
 */
export const scrubProfileDateOfBirth = onCall({ region: 'us-central1' }, async (request) => {
  await requireAdmin(request);
  const requestedLimit = Number((request.data as { limit?: unknown } | undefined)?.limit ?? 100);
  const limit = Math.max(1, Math.min(250, Number.isFinite(requestedLimit) ? requestedLimit : 100));
  const snap = await db
    .collection('profiles')
    .where('date_of_birth', '!=', null)
    .limit(limit)
    .get();

  let scrubbed = 0;
  for (const doc of snap.docs) {
    if (await moveDateOfBirthToPrivate(doc.id, doc.data() || {})) scrubbed += 1;
  }
  return { ok: true, scanned: snap.size, scrubbed };
});

/** Checked existing people suggestions; birthday data never leaves the server. */
export const getDiscoveryProfiles = onCall({ cors: true, invoker: 'public', region: 'us-central1', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`people-discovery:${uid}`, 30, 60));
  return peopleDiscovery(db, auth, uid, request.data);
});
