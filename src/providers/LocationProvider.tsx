import { createContext, useContext, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useBackgroundLocation, LocationState } from '@/hooks/useBackgroundLocation';
import { isMapRoute } from '@/lib/locationRoutes';

const LocationContext = createContext<LocationState>({
  coords: null,
  accuracy: null,
  speed: null,
  heading: null,
  sharing: false,
  sharingEnabled: false, sharingPending: false, sharingReady: false, sharingError: null, legacySharingNeedsReview: false, retrySharing: () => {},
  locationAvailable: false,
  locationDenied: false,
  ghostUntil: null,
  setSharing: async () => {},
  requestLocation: () => {},
  enableTemporaryGhost: async () => {},
  exitGhost: async () => {},
});

export function useLocationContext() {
  return useContext(LocationContext);
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  // GPS permission is requested only on /map (see useBackgroundLocation), not on app open.
  const location = useBackgroundLocation(profile?.id, {
    watchOnMap: isMapRoute(pathname),
  });

  return (
    <LocationContext.Provider value={location}>
      {children}
    </LocationContext.Provider>
  );
}
