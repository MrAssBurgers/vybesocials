import { createContext, useContext, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useBackgroundLocation, LocationState } from '@/hooks/useBackgroundLocation';
import { isMapRoute } from '@/lib/locationRoutes';

const LocationContext = createContext<LocationState>({
  coords: null,
  accuracy: null,
  speed: null,
  heading: null,
  sharing: false,
  setSharing: () => {},
});

export function useLocationContext() {
  return useContext(LocationContext);
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const { pathname } = useLocation();
  const location = useBackgroundLocation(profileId ?? profile?.id, {
    watchOnMap: isMapRoute(pathname),
  });

  return (
    <LocationContext.Provider value={location}>
      {children}
    </LocationContext.Provider>
  );
}
