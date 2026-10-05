/**
 * VybeMap — Firebase Firestore only (no Supabase/Postgres).
 * Live sharing is managed separately by locationSharingService.
 */
import {
  setDocument,
  getDocuments,
  getDocumentsFromServer,
  newDocumentId,
  where,
  orderBy,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import type { MapStoryPin, MapPostPin, MapClipPin, MapEventPin } from './types';

export const COLLECTIONS = {
  history: 'location_history',
  accessLogs: 'location_access_logs',
  places: 'map_places',
  placePosts: 'map_place_posts',
  placePostComments: 'map_place_post_comments',
  checkIns: 'map_check_ins',
  meetups: 'map_meetups',
  meetupMembers: 'map_meetup_members',
  stories: 'map_story_pins',
  posts: 'map_post_pins',
  clips: 'map_clip_pins',
  eventPins: 'map_event_pins',
  finderSessions: 'friend_finder_sessions',
  friendRequests: 'friend_requests',
  profiles: 'profiles',
} as const;

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





export async function fetchEventPins(): Promise<MapEventPin[]> {
  return getDocuments<MapEventPin>(COLLECTIONS.eventPins, [firestoreLimit(80)]);
}

























export async function fetchLocationHistory(userId: string, sinceMs: number) {
  return getDocuments(COLLECTIONS.history, [
    where('user_id', '==', userId),
    where('recorded_at', '>=', new Date(sinceMs).toISOString()),
    orderBy('recorded_at', 'asc'),
    firestoreLimit(500),
  ]);
}
