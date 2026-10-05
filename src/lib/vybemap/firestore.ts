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
  getDocumentFromServer,
  getDocumentsFromServer,
  newDocumentId,
  onSnapshot,
  query,
  where,
  orderBy,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import type { Unsubscribe } from 'firebase/firestore';
import type { LiveFriend, MapStoryPin, MapPostPin, MapClipPin, MapMeetup, MapPlace, HeatmapCell, MapEventPin, MapPlacePost, MapPlacePostComment, FriendCheckIn } from './types';
import { encodeGeohash } from './geohash';
import { isValidLatLng, approximateCoords } from './geo';
import { detectActivity } from './activity';

export const COLLECTIONS = {
  live: 'user_live_locations',
  history: 'location_history',
  accessLogs: 'location_access_logs',
  places: 'map_places',
  placePosts: 'map_place_posts',
  placePostComments: 'map_place_post_comments',
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
    getDocumentsFromServer<{ receiver_id: string }>(COLLECTIONS.friendRequests, [
      where('sender_id', '==', profileId),
      where('status', '==', 'accepted'),
    ]),
    getDocumentsFromServer<{ sender_id: string }>(COLLECTIONS.friendRequests, [
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

interface LocationShare {
  id: string;
  viewer_id: string;
  sharer_id: string;
  active: boolean;
  paused?: boolean;
  precision?: string;
  expires_at?: string | null;
}

/** Only explicit shares addressed to this viewer can authorize location reads.
 * Never scan all users' live coordinates then filter them in the browser. */
export async function fetchLiveFriends(viewerId: string, friendIds: string[], guard: () => void): Promise<LiveFriend[]> {
  guard();
  if (!viewerId || !friendIds.length) return [];
  const shares = await getDocumentsFromServer<LocationShare>('location_shares', [
    where('viewer_id', '==', viewerId), firestoreLimit(201),
  ]);
  guard();
  if (shares.length > 200) throw new Error('Too many location shares to load at once. Manage your existing shares first.');
  const friendSet = new Set(friendIds);
  const now = Date.now();
  const admitted = shares.filter(share => share.viewer_id === viewerId && friendSet.has(share.sharer_id)
    && share.active === true && share.paused !== true
    && (!share.expires_at || Date.parse(share.expires_at) > now));
  const rows: LiveLocationPayload[] = [];
  // Keep requests bounded even with a large friend list; each read is checked by
  // the current rules and a revocation failure hides this refresh's entire list.
  for (let offset = 0; offset < admitted.length; offset += 8) {
    const batch = await Promise.all(admitted.slice(offset, offset + 8).map(async share => {
      guard();
      const row = await getDocumentFromServer<LiveLocationPayload>(COLLECTIONS.live, share.sharer_id);
      guard();
      if (!row || row.user_id !== share.sharer_id || row.sharing_enabled !== true || row.is_ghost !== false
        || !isValidLatLng(row.latitude, row.longitude) || !row.expires_at || !(Date.parse(row.expires_at) > Date.now())) return null;
      return share.precision === 'precise' ? row : { ...row, sharing_mode: 'approximate' };
    }));
    guard();
    rows.push(...batch.filter((row): row is LiveLocationPayload => row !== null));
  }
  const result = await enrichFriends(rows);
  guard();
  return result;
}

/** Share changes invalidate the list. Coordinates are refreshed by the bounded
 * polling query, rather than an unauthorized collection-wide listener. */
export function subscribeLiveFriends(viewerId: string, onUpdate: () => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(query(collectionRef('location_shares'), where('viewer_id', '==', viewerId), firestoreLimit(201)),
    () => onUpdate(), onError);
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
  const [meetups, members] = await Promise.all([
    getDocuments<MapMeetup>(COLLECTIONS.meetups, [
      where('status', '==', 'active'),
      orderBy('starts_at', 'asc'),
      firestoreLimit(40),
    ]),
    getDocuments<{ meetup_id: string; user_id: string; status: string }>(COLLECTIONS.meetupMembers, [
      firestoreLimit(400),
    ]),
  ]);
  const byMeetup = new Map<string, { user_id: string; status: string }[]>();
  for (const m of members) {
    const list = byMeetup.get(m.meetup_id) ?? [];
    list.push({ user_id: m.user_id, status: m.status });
    byMeetup.set(m.meetup_id, list);
  }
  return meetups.map((meetup) => {
    const mem = byMeetup.get(meetup.id) ?? [];
    return {
      ...meetup,
      members: mem,
      member_count: mem.length || 1,
    };
  });
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

export async function createCheckIn(
  profileId: string,
  lat: number,
  lng: number,
  message?: string,
  placeId?: string,
  placeName?: string,
): Promise<void> {
  const id = newDocumentId(COLLECTIONS.checkIns);
  await setDocument(COLLECTIONS.checkIns, id, {
    user_id: profileId,
    place_id: placeId ?? null,
    place_name: placeName ?? null,
    latitude: lat,
    longitude: lng,
    message: message ?? null,
    visibility: 'friends',
    created_at: new Date().toISOString(),
    geohash: encodeGeohash(lat, lng, 7),
  });
  if (placeId) {
    const place = await getDocument<{ check_in_count?: number }>(COLLECTIONS.places, placeId);
    await setDocument(COLLECTIONS.places, placeId, {
      check_in_count: ((place?.check_in_count as number) || 0) + 1,
      updated_at: new Date().toISOString(),
    }, true);
  }
}

export async function fetchPlacePosts(placeId: string): Promise<MapPlacePost[]> {
  const rows = await getDocuments<MapPlacePost>(COLLECTIONS.placePosts, [
    where('place_id', '==', placeId),
    orderBy('created_at', 'desc'),
    firestoreLimit(40),
  ]);
  return attachProfiles(rows);
}

export async function createPlacePost(
  profileId: string,
  placeId: string,
  content: string,
  mediaUrl?: string,
): Promise<string> {
  const id = newDocumentId(COLLECTIONS.placePosts);
  await setDocument(COLLECTIONS.placePosts, id, {
    place_id: placeId,
    user_id: profileId,
    content,
    media_url: mediaUrl ?? null,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
  });
  return id;
}

async function attachProfiles<T extends { user_id: string }>(
  rows: T[],
): Promise<(T & { profile: { username: string | null; display_name: string | null; avatar_url: string | null } | null })[]> {
  if (!rows.length) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const profiles = await Promise.all(
    userIds.map((id) => getDocument<{ username: string | null; display_name: string | null; avatar_url: string | null }>(COLLECTIONS.profiles, id)),
  );
  const byId = new Map(userIds.map((id, i) => [id, profiles[i]]));
  return rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
}

export async function fetchPlacePostComments(postId: string): Promise<MapPlacePostComment[]> {
  const rows = await getDocuments<MapPlacePostComment>(COLLECTIONS.placePostComments, [
    where('post_id', '==', postId),
    orderBy('created_at', 'asc'),
    firestoreLimit(50),
  ]);
  return attachProfiles(rows);
}

export async function createPlacePostComment(
  profileId: string,
  postId: string,
  content: string,
): Promise<string> {
  const id = newDocumentId(COLLECTIONS.placePostComments);
  await setDocument(COLLECTIONS.placePostComments, id, {
    post_id: postId,
    user_id: profileId,
    content,
    created_at: new Date().toISOString(),
  });
  const post = await getDocument<{ comment_count?: number }>(COLLECTIONS.placePosts, postId);
  await setDocument(COLLECTIONS.placePosts, postId, {
    comment_count: ((post?.comment_count as number) || 0) + 1,
  }, true);
  return id;
}

export async function joinMeetup(profileId: string, meetupId: string): Promise<void> {
  const existing = await getDocuments<{ id: string }>(COLLECTIONS.meetupMembers, [
    where('meetup_id', '==', meetupId),
    where('user_id', '==', profileId),
    firestoreLimit(1),
  ]);
  if (existing.length) return;
  const id = newDocumentId(COLLECTIONS.meetupMembers);
  await setDocument(COLLECTIONS.meetupMembers, id, {
    meetup_id: meetupId,
    user_id: profileId,
    status: 'going',
    joined_at: new Date().toISOString(),
  });
}

export async function leaveMeetup(profileId: string, meetupId: string): Promise<void> {
  const rows = await getDocuments<{ id: string }>(COLLECTIONS.meetupMembers, [
    where('meetup_id', '==', meetupId),
    where('user_id', '==', profileId),
    firestoreLimit(5),
  ]);
  await Promise.all(rows.map((r) => setDocument(COLLECTIONS.meetupMembers, r.id, { status: 'left' }, true)));
}

export async function fetchMyMeetupMemberships(profileId: string): Promise<Set<string>> {
  const rows = await getDocuments<{ meetup_id: string; status: string }>(COLLECTIONS.meetupMembers, [
    where('user_id', '==', profileId),
    firestoreLimit(100),
  ]);
  return new Set(rows.filter((r) => r.status === 'going').map((r) => r.meetup_id));
}

export async function fetchFriendCheckIns(friendIds: string[], limit = 30): Promise<FriendCheckIn[]> {
  if (!friendIds.length) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await getDocuments<FriendCheckIn>(COLLECTIONS.checkIns, [
    where('created_at', '>=', since),
    orderBy('created_at', 'desc'),
    firestoreLimit(80),
  ]);
  const friendSet = new Set(friendIds);
  const filtered = rows.filter((r) => friendSet.has(r.user_id)).slice(0, limit);
  if (!filtered.length) return [];
  const userIds = Array.from(new Set(filtered.map((r) => r.user_id)));
  const profiles = await Promise.all(
    userIds.map((id) => getDocument<{ username: string | null; display_name: string | null; avatar_url: string | null }>(COLLECTIONS.profiles, id)),
  );
  const byId = new Map(userIds.map((id, i) => [id, profiles[i]]));
  return filtered.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));
}

export async function createMapSpot(
  profileId: string,
  input: {
    name: string;
    category: string;
    description?: string;
    photo_url?: string;
    latitude: number;
    longitude: number;
    vibe_tags?: string[];
    city?: string;
  },
): Promise<string> {
  const id = newDocumentId(COLLECTIONS.places);
  await setDocument(COLLECTIONS.places, id, {
    name: input.name,
    category: input.category,
    description: input.description ?? null,
    photo_url: input.photo_url ?? null,
    created_by: profileId,
    latitude: input.latitude,
    longitude: input.longitude,
    city: input.city ?? null,
    vibe_tags: input.vibe_tags ?? [input.category],
    check_in_count: 1,
    story_count: 0,
    geohash: encodeGeohash(input.latitude, input.longitude, 7),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await createCheckIn(profileId, input.latitude, input.longitude, input.description, id, input.name);
  return id;
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
