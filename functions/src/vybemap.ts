/**
 * VybeMap Cloud Functions — location abuse detection, heatmap aggregation, meetup notifications.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { getOrResearchLocationIntel } from './_shared/mapLocationIntel.js';
import { runLocationSharing } from './_shared/locationSharingAuthority.js';

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
export const emergencyGhostMode = onCall(async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`location:${uid}:change`, 30, 60));
  return runLocationSharing(db, uid, { ...request.data, action: 'setSharing', enabled: false });
});

/** AI area intelligence — safety, trespassing, access rules (Gemini + Google Search). */
export const researchMapLocation = onCall(
  { secrets: [...INTEL_SECRETS], region: 'us-central1' },
  async (request) => {
    const uid = requireAuth(request);
    enforceRateLimit(await rateLimit(`map_intel:${uid}`, 12, 3600));

    const { latitude, longitude, placeName, placeId, forceRefresh } = (request.data || {}) as {
      latitude?: number;
      longitude?: number;
      placeName?: string;
      placeId?: string;
      forceRefresh?: boolean;
    };

    if (latitude == null || longitude == null) {
      throw new HttpsError('invalid-argument', 'latitude & longitude required');
    }

    const intel = await getOrResearchLocationIntel({
      lat: latitude,
      lng: longitude,
      placeName,
      placeId,
      forceRefresh: !!forceRefresh,
    });

    return { intel };
  },
);

async function fetchFriendIdsForProfile(profileId: string): Promise<string[]> {
  const [sent, recv] = await Promise.all([
    db.collection('friend_requests').where('sender_id', '==', profileId).where('status', '==', 'accepted').limit(80).get(),
    db.collection('friend_requests').where('receiver_id', '==', profileId).where('status', '==', 'accepted').limit(80).get(),
  ]);
  const ids = new Set<string>();
  sent.docs.forEach((d) => {
    const rid = d.data().receiver_id as string | undefined;
    if (rid) ids.add(rid);
  });
  recv.docs.forEach((d) => {
    const sid = d.data().sender_id as string | undefined;
    if (sid) ids.add(sid);
  });
  return Array.from(ids);
}

/** Notify friends when someone starts a meetup on VybeMap. */
export const onMapMeetupCreated = onDocumentCreated(
  { document: 'map_meetups/{meetupId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const meetup = snap.data() as {
      host_id?: string;
      title?: string;
      dest_label?: string;
    };
    const hostId = meetup.host_id;
    if (!hostId) return;

    const hostSnap = await db.collection('profiles').doc(hostId).get();
    const host = hostSnap.data() || {};
    const hostName = (host.display_name as string) || (host.username as string) || 'A friend';
    const meetupTitle = meetup.title || meetup.dest_label || 'a meetup';

    const friendIds = (await fetchFriendIdsForProfile(hostId)).slice(0, 40);
    if (!friendIds.length) return;

    const batch = db.batch();
    const now = new Date().toISOString();
    for (const friendId of friendIds) {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        user_id: friendId,
        actor_id: hostId,
        type: 'map_meetup',
        title: hostName,
        body: `started a meetup: ${meetupTitle}`,
        deep_link: '/map',
        meetup_id: snap.id,
        read: false,
        created_at: now,
      });
    }
    await batch.commit();
  },
);
