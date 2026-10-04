import { useApproximateLocation } from './useApproximateLocation';
import { useSocialFeed } from './useSocialFeed';

/** Local never falls back to unrelated posts or reads saved GPS coordinates. */
export function useLocalFeed(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? false;
  const location = useApproximateLocation(enabled);
  const query = useSocialFeed(undefined, enabled && !!location.location, 'local', location.location ?? undefined);
  return { ...query, localLocation: location };
}
