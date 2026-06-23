/**
 * VybeMap — Firebase Firestore only (no Supabase/Postgres).
 * Canonical live location: user_live_locations/{profileId}
 */
import {
  collectionRef,
  documentRef,
  setDocument,
  getDocument,
  getDocuments,
  newDocumentId,
  onSnapshot,
  query,
  where,
  orderBy,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import type { Unsubscribe } from 'firebase/firestore';
import type { LiveFriend, MapStoryPin, MapPostPin, MapClipPin, MapMeetup, MapPlace, HeatmapCell, MapEventPin } from './types';
import { encodeGeohash } from './geohash';
import { isValidLatLng, approximateCoords } from './geo';
import { detectActivity } from './activity';

export const COLLECTIONS = {
  live: 'user_live_locations',
  history: 'location_history',
  accessLogs: 'location_access_logs',
  places: 'map_places',
  checkIns: 'map_check_ins',
  meetups: 'map_meetups',
  meetupMembers: 'map_meetup_members',
  heatmap: 'heatmap_tiles',
  stories: 'map_story_pins',
  posts: 'map_post_pins',
  clips: 'map_clip_pins',
  eventPins: 'map_event_pins',
  finderSessions: 'friend_finder_sessions',
  friendRequests: 'friend_requests',
  profiles: 'profiles',
} as const;

export interface LiveLocationPayload {
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery_percent?: number | null;
  activity_type?: string;
  geohash?: string;
  city?: string | null;
  label?: string | null;
  status?: string | null;
  sharing_enabled: boolean;
  is_ghost: boolean;
  sharing_mode?: string;
  approx_radius_m?: number;
  expires_at: string;
  updated_at: string;
}

export async function upsertLiveLocation(profileId: string, payload: Omit<LiveLocationPayload, 'updated_at'>): Promise<void> {
  await setDocument(COLLECTIONS.live, profileId, {
    ...payload,
    user_id: profileId,
    updated_at: new Date().toISOString(),
  });
}

export async function disableLiveLocation(profileId: string): Promise<void> {
  await setDocument(COLLECTIONS.live, profileId, {
    sharing_enabled: false,
    is_ghost: true,
  }, true);
}

export async function appendLocationHistory(profileId: string, row: Record<string, unknown>): Promise<void> {
  const id = newDocumentId(COLLECTIONS.history);
  await setDocument(COLLECTIONS.history, id, { user_id: profileId, ...row, recorded_at: new Date().toISOString() });
}

export async function fetchFriendIds(profileId: string): Promise<string[]> {
  const [sent, recv] = await Promise.all([
    getDocuments<{ receiver_id: string }>(COLLECTIONS.friendRequests, [
      where('sender_id', '==', profileId),
      where('status', '==', 'accepted'),
    ]),
    getDocuments<{ sender_id: string }>(COLLECTIONS.friendRequests, [
      where('receiver_id', '==', profileId),
      where('status', '==', 'accepted'),
    ]),
  ]);
  return Array.from(new Set([
    ...sent.map((r) => r.receiver_id),
    ...recv.map((r) => r.sender_id),
  ]));
}

async function enrichFriends(rows: LiveLocationPayload[]): Promise<LiveFriend[]> {
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  const profileRows = await Promise.all(
    ids.map((id) => getDocument<{ username: string | null; display_name: string | null; avatar_url: string | null; bio?: string | null }>(COLLECTIONS.profiles, id)),
  );
  const byId = new Map(ids.map((id, i) => [id, profileRows[i]]));

  return rows.map((row) => {
    let lat = row.latitude;
    let lng = row.longitude;
    if (row.sharing_mode === 'approximate' || (row.approx_radius_m && row.approx_radius_m > 0)) {
      const j = approximateCoords(lat, lng, row.user_id);
      lat = j.lat;
      lng = j.lng;
    }
    return {
      id: row.user_id,
      user_id: row.user_id,
      latitude: lat,
      longitude: lng,
      accuracy: row.accuracy,
      label: row.label ?? null,
      city: row.city,
      updated_at: row.updated_at,
      expires_at: row.expires_at,
      sharing_enabled: row.sharing_enabled,
      sharing_mode: row.sharing_mode as LiveFriend['sharing_mode'],
      status: row.status,
      speed: row.speed,
      heading: row.heading,
      battery_percent: row.battery_percent,
      activity_type: (row.activity_type || detectActivity(row.speed, row.status)) as LiveFriend['activity_type'],
      geohash: row.geohash,
      approx_radius_m: row.approx_radius_m,
      profile: byId.get(row.user_id) || null,
    };
  });
}

export async function fetchLiveFriends(friendIds: string[]): Promise<LiveFriend[]> {
  if (!friendIds.length) return [];
  const friendSet = new Set(friendIds);
  const nowIso = new Date().toISOString();
  const rows = await getDocuments<LiveLocationPayload & { id: string }>(COLLECTIONS.live, [
    where('sharing_enabled', '==', true),
    where('is_ghost', '==', false),
  ]);
  const filtered = rows.filter(
    (r) => friendSet.has(r.user_id) && isValidLatLng(r.latitude, r.longitude) && (!r.expires_at || r.expires_at > nowIso),
  );
  return enrichFriends(filtered);
}

/** Realtime: listen to all shared live locations, filter to friends client-side. */
export function subscribeLiveFriends(friendIdSet: Set<string>, onUpdate: () => void): Unsubscribe {
  const q = query(
    collectionRef(COLLECTIONS.live),
    where('sharing_enabled', '==', true),
    where('is_ghost', '==', false),
  );
  return onSnapshot(q, (snap) => {
    const relevant = snap.docChanges().some((c) => {
      const uid = (c.doc.data() as { user_id?: string }).user_id;
      return uid && friendIdSet.has(uid);
    });
    if (relevant || snap.docChanges().length === 0) onUpdate();
  });
}

export async function logLocationAccess(viewerId: string, targetId: string, action: string): Promise<void> {
  const id = newDocumentId(COLLECTIONS.accessLogs);
  await setDocument(COLLECTIONS.accessLogs, id, {
    viewer_id: viewerId,
    target_id: targetId,
    action,
    created_at: new Date().toISOString(),
  });
}

export async function startFinderSession(seekerId: string, targetId: string): Promise<string> {
  const id = newDocumentId(COLLECTIONS.finderSessions);
  await setDocument(COLLECTIONS.finderSessions, id, {
    seeker_id: seekerId,
    target_id: targetId,
    started_at: new Date().toISOString(),
    ar_mode: false,
  });
  return id;
}

export async function fetchMapStories(): Promise<MapStoryPin[]> {
  const now = new Date().toISOString();
  const rows = await getDocuments<MapStoryPin>(COLLECTIONS.stories, [
    where('expires_at', '>', now),
    firestoreLimit(80),
  ]);
  return rows;
}

export async function fetchMapPosts(): Promise<MapPostPin[]> {
  return getDocuments<MapPostPin>(COLLECTIONS.posts, [orderBy('created_at', 'desc'), firestoreLimit(60)]);
}

export async function fetchMapClips(): Promise<MapClipPin[]> {
  return getDocuments<MapClipPin>(COLLECTIONS.clips, [orderBy('created_at', 'desc'), firestoreLimit(60)]);
}

export async function fetchMapMeetups(): Promise<MapMeetup[]> {
  return getDocuments<MapMeetup>(COLLECTIONS.meetups, [
    where('status', '==', 'active'),
    orderBy('starts_at', 'asc'),
    firestoreLimit(40),
  ]);
}

export async function fetchHeatmap(): Promise<HeatmapCell[]> {
  const rows = await getDocuments<HeatmapCell & { intensity: number }>(COLLECTIONS.heatmap, [
    orderBy('intensity', 'desc'),
    firestoreLimit(200),
  ]);
  return rows.map((r) => ({
    geohash_prefix: r.geohash_prefix,
    cell_latitude: r.cell_latitude,
    cell_longitude: r.cell_longitude,
    intensity: r.intensity,
    pulse_level: r.pulse_level ?? 1,
  }));
}

export async function fetchMapPlaces(): Promise<MapPlace[]> {
  return getDocuments<MapPlace>(COLLECTIONS.places, [orderBy('check_in_count', 'desc'), firestoreLimit(100)]);
}

export async function fetchEventPins(): Promise<MapEventPin[]> {
  return getDocuments<MapEventPin>(COLLECTIONS.eventPins, [firestoreLimit(80)]);
}

export async function createCheckIn(profileId: string, lat: number, lng: number, message?: string): Promise<void> {
  const id = newDocumentId(COLLECTIONS.checkIns);
  await setDocument(COLLECTIONS.checkIns, id, {
    user_id: profileId,
    latitude: lat,
    longitude: lng,
    message: message ?? null,
    visibility: 'friends',
    created_at: new Date().toISOString(),
    geohash: encodeGeohash(lat, lng, 7),
  });
}

export async function createMeetup(
  hostId: string,
  input: { title: string; dest_latitude: number; dest_longitude: number; dest_label?: string; description?: string },
): Promise<string> {
  const id = newDocumentId(COLLECTIONS.meetups);
  await setDocument(COLLECTIONS.meetups, id, {
    host_id: hostId,
    ...input,
    status: 'active',
    starts_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  const memberId = newDocumentId(COLLECTIONS.meetupMembers);
  await setDocument(COLLECTIONS.meetupMembers, memberId, {
    meetup_id: id,
    user_id: hostId,
    status: 'going',
  });
  return id;
}

export async function fetchLocationHistory(userId: string, sinceMs: number) {
  return getDocuments(COLLECTIONS.history, [
    where('user_id', '==', userId),
    where('recorded_at', '>=', new Date(sinceMs).toISOString()),
    orderBy('recorded_at', 'asc'),
    firestoreLimit(500),
  ]);
}
