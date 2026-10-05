import type { LocationRead, LocationRequest, LocationShare } from '@/lib/locationSharingService';
export const revision = 'a'.repeat(48), shareId = 'b'.repeat(64), requestId = 'c'.repeat(64);
export function grant(extra: Partial<LocationShare> = {}): LocationShare {
  const now = Date.now();
  return { id: shareId, revision, sharerId: 'bob', viewerId: 'alice', precision: 'approximate', duration: '1h', active: true, paused: false, expiresAt: new Date(now + 300_000).toISOString(), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), ...extra };
}
export function locationRequest(extra: Partial<LocationRequest> = {}): LocationRequest {
  const now = new Date().toISOString();
  return { id: requestId, revision, requesterId: 'alice', targetId: 'bob', requester: { id: 'alice', username: 'Alice', displayName: null, avatarUrl: null }, target: { id: 'bob', username: 'Bob', displayName: null, avatarUrl: null }, precision: 'approximate', duration: '1h', customMinutes: null, message: null, status: 'pending', expiresAt: new Date(Date.now() + 300_000).toISOString(), createdAt: now, updatedAt: now, shareId: null, ...extra };
}
export function locationRead(extra: Partial<LocationRead> = {}): LocationRead {
  const now = Date.now();
  return { state: { revision, enabled: false, updatedAt: new Date(now).toISOString() }, shares: [grant()], requests: [], locations: [{ id: 'bob', shareId, latitude: 30.01, longitude: -97.01, accuracy: 2000, speed: null, heading: null, batteryPercent: 50, activityType: 'stationary', precision: 'approximate', approxRadiusM: 2000, updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), profile: { username: 'Private Bob', displayName: null, avatarUrl: null } }], targetId: null, leaseUntil: now + 15000, serverTime: now, legacySharingNeedsReview: false, ...extra };
}
