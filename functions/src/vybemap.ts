/**
 * VybeMap Cloud Functions — location abuse detection, heatmap aggregation, meetup notifications.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { getOrResearchLocationIntel } from './_shared/mapLocationIntel.js';
import { runLocationSharing } from './_shared/locationSharingAuthority.js';
import { mapSocialHash, notifyMapMeetup, resolveMapIntelTarget } from './_shared/mapSocialAuthority.js';

const INTEL_SECRETS = ['GEMINI_API_KEY'] as const;

/** Rate-limit location access — anti-stalking. */
export const logMapAccess = onCall(async (request) => {
  const uid = requireAuth(request);
  const { targetProfileId, action } = (request.data || {}) as { targetProfileId?: string; action?: string };
  if (!targetProfileId || !action) throw new HttpsError('invalid-argument', 'targetProfileId & action required');

  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const recent = await db.collection('map_access_rate').doc(`${uid}_${targetProfileId}`).get();
  const count = (recent.data()?.count as number) || 0;
  if (count > 60) throw new HttpsError('resource-exhausted', 'Too many location requests — try again later');

  await db.collection('map_access_rate').doc(`${uid}_${targetProfileId}`).set({
    count: count + 1,
    last_action: action,
    updated_at: new Date().toISOString(),
    window_start: recent.data()?.window_start || hourAgo,
  }, { merge: true });

  return { ok: true };
});

/** Retire the old global heatmap, which copied exact private coordinates.
 * Current clients derive coarse cells only from their checked location read. */
export const aggregateVybeHeatmap = onSchedule('every 15 minutes', async () => {
  const snap = await db.collection('heatmap_tiles').limit(200).get();
  const batch = db.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
});

/** Emergency ghost — instant hide from all maps. */
export const emergencyGhostMode = onCall({ cors: true, invoker: 'public', timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`location:${uid}:change`, 30, 60));
  return runLocationSharing(db, uid, { ...request.data, action: 'setSharing', enabled: false });
});

/** AI area intelligence — safety, trespassing, access rules (Gemini + Google Search). */
export const researchMapLocation = onCall(
  { secrets: [...INTEL_SECRETS], region: 'us-central1', cors: true, invoker: 'public', timeoutSeconds: 60 },
  async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`map_intel_read:${uid}`, 120, 60));
    const target = await resolveMapIntelTarget(db, uid, request.data);
    const intel = await getOrResearchLocationIntel({
      ownerUid: uid, profileId: target.profileId, lat: target.latitude, lng: target.longitude,
      placeName: target.placeName ?? undefined, placeId: target.placeId ?? undefined, forceRefresh: request.data?.forceRefresh === true,
      beforeResearch: async () => { enforceRateLimit(await rateLimit(`map_intel:${uid}`, 12, 3600)); },
      beforeReturn: async () => {
        const current = await resolveMapIntelTarget(db, uid, request.data);
        if (mapSocialHash(current) !== mapSocialHash(target)) throw new HttpsError('aborted', 'This place changed while researching. Refresh and retry.');
      },
    });
    const serverTime = Date.now();
    return { ok: true, ownerUid: uid, profileId: target.profileId, placeId: target.placeId, serverTime, validUntil: serverTime + 15000, intel };
  },
);

/** Notify friends when someone starts a meetup on VybeMap. */
export const onMapMeetupCreated = onDocumentCreated(
  { document: 'map_meetups/{meetupId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    await notifyMapMeetup(db, snap.id);
  },
);
