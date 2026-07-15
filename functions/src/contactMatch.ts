import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { createHash } from 'crypto';
import { db, requireAuth } from './_shared/admin.js';

function sha256Hex(input: string): string {
  return createHash('sha256').update(input.toLowerCase()).digest('hex');
}

function isSha256Hex(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export type ContactMatchRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  phone_hash: string;
};

/**
 * match_contacts — match client-hashed phone numbers against discoverable profiles.
 * Clients hash E.164 locally; we never receive plain phone numbers here.
 */
export const matchContacts = onCall(async (request) => {
  const uid = requireAuth(request);
  const { hashes } = (request.data || {}) as { hashes?: unknown };
  if (!Array.isArray(hashes)) throw new HttpsError('invalid-argument', 'hashes required');

  const unique = Array.from(
    new Set(
      hashes
        .map((h) => String(h || '').trim().toLowerCase())
        .filter((h) => isSha256Hex(h)),
    ),
  ).slice(0, 2000);

  if (!unique.length) return [];

  const byId = new Map<string, ContactMatchRow>();

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await db
      .collection('profiles')
      .where('contact_discoverable', '==', true)
      .where('phone_e164_sha256', 'in', chunk)
      .limit(30)
      .get();

    for (const doc of snap.docs) {
      const p = doc.data() as Record<string, unknown>;
      const owner = String(p.user_id || doc.id);
      if (owner === uid) continue;
      const profileId = String(p.id || doc.id);
      if (byId.has(profileId)) continue;
      const phoneHash = String(p.phone_e164_sha256 || '');
      if (!phoneHash) continue;
      byId.set(profileId, {
        id: profileId,
        username: String(p.username || ''),
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
        is_verified: Boolean(p.is_verified),
        phone_hash: phoneHash,
      });
    }
  }

  return Array.from(byId.values());
});

/** Hash helper for phone verify write path. */
export function hashPhoneE164Server(e164: string): string {
  return sha256Hex(e164);
}
