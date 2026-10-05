import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { MapPlace, MapMeetup } from './types';

export type MapSocialRouteLease = { accountScope: string; kind: 'place' | 'meetup'; id: string; revision: string; queryKey: QueryKey };
type Admission = { item: MapPlace | MapMeetup | null; validUntil: number };
export const mapRouteAccountScope = (uid: string | undefined, profileId: string | undefined, epoch: number) => JSON.stringify([uid, profileId, epoch]);
/** Read the checked detail cache, never a list snapshot or remembered coordinates. */
export function currentMapSocialRoute(client: QueryClient, lease: MapSocialRouteLease | undefined, accountScope: string, now = Date.now()) {
  if (!lease || lease.accountScope !== accountScope || document.visibilityState === 'hidden') return undefined;
  const state = client.getQueryState<Admission>(lease.queryKey), data = state?.data;
  if (state?.status !== 'success' || !data?.item || !Number.isFinite(data.validUntil) || data.validUntil <= now || data.item.id !== lease.id || data.item.revision !== lease.revision) return undefined;
  return data;
}
export function captureMapSocialRoute(client: QueryClient, queryKey: QueryKey, accountScope: string, kind: 'place' | 'meetup', id: string): MapSocialRouteLease {
  const data = client.getQueryData<Admission>(queryKey);
  const lease = { accountScope, kind, id, revision: data?.item?.revision || '', queryKey };
  if (!/^[a-f0-9]{48}$/.test(lease.revision) || !currentMapSocialRoute(client, lease, accountScope)) throw new Error('Refresh this map item before starting directions.');
  return lease;
}
