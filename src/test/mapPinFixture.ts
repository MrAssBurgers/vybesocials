import type { MapContentPin } from '@/lib/vybemap/mapPinService';
export const mapPinFixture = (patch: Partial<MapContentPin> = {}): MapContentPin => ({
  id: 'a'.repeat(64), sourceId: 'shared-post', kind: 'post', sourceType: 'post', revision: 'b'.repeat(48), publicationRevision: 'c'.repeat(48), userId: 'alice', caption: 'A shared moment', mediaUrl: null, thumbnailUrl: null,
  latitude: 41.89, longitude: -87.63, precision: 'approximate', radiusMeters: 2000, areaLabel: 'Chicago', sharedAt: '2026-10-05T00:00:00.000Z', author: { id: 'alice', username: 'alice', displayName: 'Alice', avatarUrl: null }, ...patch,
});
