import { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useBackgroundLocation, LocationState } from '@/hooks/useBackgroundLocation';

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
  const location = useBackgroundLocation(profile?.id);

  return (
    <LocationContext.Provider value={location}>
      {children}
    </LocationContext.Provider>
  );
}
