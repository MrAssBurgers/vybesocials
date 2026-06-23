import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLocationIntel } from '@/lib/vybemap/locationIntel';

function intelQueryKey(
  latitude: number,
  longitude: number,
  placeName?: string,
  placeId?: string,
) {
  return ['vybemap-location-intel', latitude, longitude, placeName, placeId] as const;
}

export function useLocationIntel(opts: {
  latitude: number;
  longitude: number;
  placeName?: string;
  placeId?: string;
  enabled?: boolean;
}) {
  const { latitude, longitude, placeName, placeId, enabled = true } = opts;
  const qc = useQueryClient();
  const [forceLoading, setForceLoading] = useState(false);
  const key = intelQueryKey(latitude, longitude, placeName, placeId);

  const query = useQuery({
    queryKey: key,
    enabled: enabled && Number.isFinite(latitude) && Number.isFinite(longitude),
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    queryFn: () => fetchLocationIntel({
      latitude,
      longitude,
      placeName,
      placeId,
    }),
  });

  const refreshIntel = useCallback(async () => {
    setForceLoading(true);
    try {
      const fresh = await fetchLocationIntel({
        latitude,
        longitude,
        placeName,
        placeId,
        forceRefresh: true,
      });
      if (fresh) qc.setQueryData(key, fresh);
      else await query.refetch();
    } finally {
      setForceLoading(false);
    }
  }, [latitude, longitude, placeName, placeId, qc, key, query]);

  return {
    ...query,
    isLoading: query.isLoading || forceLoading,
    isFailed: query.isError || (!query.isLoading && !forceLoading && query.isFetched && !query.data),
    refreshIntel,
  };
}
