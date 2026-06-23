import { db } from '@/lib/firebase';
import {
  collectionRef,
  getDocument,
  getDocuments,
  newDocumentId,
  setDocument,
  where,
  orderBy,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import type { MapGroupMap } from './types';

const GROUP_MAPS = 'map_group_maps';
const GROUP_MEMBERS = 'map_group_members';

export async function sendMapWave(
  fromProfileId: string,
  toProfileId: string,
  fromName: string,
): Promise<void> {
  await db.from('notifications').insert({
    user_id: toProfileId,
    actor_id: fromProfileId,
    type: 'map_wave',
    title: fromName,
    body: 'waved at you on VybeMap 👋',
    deep_link: '/map',
    read: false,
  });
}

export async function fetchMyGroupMaps(profileId: string): Promise<MapGroupMap[]> {
  const owned = await getDocuments<MapGroupMap>(GROUP_MAPS, [
    where('owner_id', '==', profileId),
    orderBy('created_at', 'desc'),
    firestoreLimit(20),
  ]);
  const memberships = await getDocuments<{ group_id: string }>(GROUP_MEMBERS, [
    where('user_id', '==', profileId),
    firestoreLimit(30),
  ]);
  const memberGroupIds = memberships.map((m) => m.group_id).filter((id) => !owned.some((o) => o.id === id));
  const joined: MapGroupMap[] = [];
  for (const gid of memberGroupIds.slice(0, 15)) {
    const doc = await getDocument<Omit<MapGroupMap, 'id'>>(GROUP_MAPS, gid);
    if (doc) joined.push({ ...doc, id: gid } as MapGroupMap);
  }
  const all = [...owned, ...joined];
  const counts = await fetchGroupMemberCounts(all.map((g) => g.id));
  return all.map((g) => ({ ...g, member_count: counts.get(g.id) ?? 1 }));
}

async function fetchGroupMemberCounts(groupIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!groupIds.length) return counts;
  const rows = await getDocuments<{ group_id: string }>(GROUP_MEMBERS, [firestoreLimit(400)]);
  for (const r of rows) {
    if (groupIds.includes(r.group_id)) {
      counts.set(r.group_id, (counts.get(r.group_id) || 0) + 1);
    }
  }
  return counts;
}

export async function createGroupMap(
  ownerId: string,
  input: { name: string; emoji?: string; color?: string },
): Promise<string> {
  const id = newDocumentId(GROUP_MAPS);
  await setDocument(GROUP_MAPS, id, {
    name: input.name.trim(),
    emoji: input.emoji || '🗺️',
    color: input.color || '#8b5cf6',
    owner_id: ownerId,
    created_at: new Date().toISOString(),
  });
  await setDocument(GROUP_MEMBERS, newDocumentId(GROUP_MEMBERS), {
    group_id: id,
    user_id: ownerId,
    role: 'owner',
    joined_at: new Date().toISOString(),
  });
  return id;
}

export async function joinGroupMap(profileId: string, groupId: string): Promise<void> {
  const existing = await getDocuments<{ id: string }>(GROUP_MEMBERS, [
    where('group_id', '==', groupId),
    where('user_id', '==', profileId),
    firestoreLimit(1),
  ]);
  if (existing.length) return;
  await setDocument(GROUP_MEMBERS, newDocumentId(GROUP_MEMBERS), {
    group_id: groupId,
    user_id: profileId,
    role: 'member',
    joined_at: new Date().toISOString(),
  });
}

export async function fetchGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await getDocuments<{ user_id: string }>(GROUP_MEMBERS, [
    where('group_id', '==', groupId),
    firestoreLimit(50),
  ]);
  return rows.map((r) => r.user_id);
}
