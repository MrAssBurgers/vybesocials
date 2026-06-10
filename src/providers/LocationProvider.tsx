import { createContext, useContext, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useBackgroundLocation, LocationState } from '@/hooks/useBackgroundLocation';
import { isMapRoute } from '@/lib/locationRoutes';

const LocationContext = createContext<LocationState>({
  coords: null,
  accuracy: null,
  speed: null,
  sharing: false,
  setSharing: () => {},
});

export function useLocationContext() {
  return useContext(LocationContext);
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const watchPosition = isMapRoute(pathname);
  const location = useBackgroundLocation(profile?.id, { watchPosition });

  return (
    <LocationContext.Provider value={location}>
      {children}
    </LocationContext.Provider>
  );
}
