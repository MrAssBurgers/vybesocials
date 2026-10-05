import type { LiveFriend } from './types';
export type MapLocationLease = { scope: string; friendId: string; revision: string; sampleExpiresAt?: number };
export function captureMapLocationLease(friend: LiveFriend, scope: string, retainSample = false): MapLocationLease {
  if (!friend.accessRevision || !friend.accessUntil || friend.accessUntil <= Date.now()) throw new Error('Refresh this friend’s location before continuing.');
  return { scope, friendId: friend.user_id, revision: friend.accessRevision, ...(retainSample ? { sampleExpiresAt: friend.sampleExpiresAt || friend.accessUntil } : {}) };
}
export function currentMapLocation(lease: MapLocationLease | undefined, scope: string, friends: LiveFriend[]) {
  if (!lease || lease.scope !== scope || (lease.sampleExpiresAt !== undefined && lease.sampleExpiresAt <= Date.now())) return undefined;
  return friends.find(friend => friend.user_id === lease.friendId && friend.accessRevision === lease.revision && (friend.accessUntil || 0) > Date.now());
}
