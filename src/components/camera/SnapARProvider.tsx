import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react';

// Snap Camera Kit types
interface SnapCameraKitSession {
  applyLens: (lensId: string, groupId: string) => Promise<void>;
  removeLens: () => Promise<void>;
  pause: () => void;
  play: () => void;
}

interface SnapARContextValue {
  isAvailable: boolean;
  isLoading: boolean;
  session: SnapCameraKitSession | null;
  applySnapLens: (lensId: string, groupId: string) => Promise<boolean>;
  removeSnapLens: () => Promise<void>;
}

const SnapARContext = createContext<SnapARContextValue>({
  isAvailable: false,
  isLoading: false,
  session: null,
  applySnapLens: async () => false,
  removeSnapLens: async () => {},
});

export const useSnapAR = () => useContext(SnapARContext);

const SNAP_API_TOKEN = import.meta.env.VITE_SNAP_CAMERA_KIT_TOKEN;

interface SnapARProviderProps {
  children: React.ReactNode;
}

/**
 * Snap Camera Kit Provider
 * Wraps the app to provide Snap AR lens capabilities.
 * Falls back gracefully if the API token is not configured.
 */
export function SnapARProvider({ children }: SnapARProviderProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const sessionRef = useRef<any>(null);
  const cameraKitRef = useRef<any>(null);
  const initPromiseRef = useRef<Promise<any> | null>(null);

  // Lazy-init Camera Kit
  const initCameraKit = useCallback(async () => {
    if (cameraKitRef.current) return cameraKitRef.current;
    if (initPromiseRef.current) return initPromiseRef.current;
    if (!SNAP_API_TOKEN) {
      console.log('[SnapAR] No API token configured — running in MediaPipe-only mode');
      return null;
    }

    initPromiseRef.current = (async () => {
      try {
        setIsLoading(true);
        const { bootstrapCameraKit } = await import('@snap/camera-kit');
        const cameraKit = await bootstrapCameraKit({ apiToken: SNAP_API_TOKEN });
        cameraKitRef.current = cameraKit;
        setIsAvailable(true);
        console.log('[SnapAR] Camera Kit initialized successfully');
        return cameraKit;
      } catch (err) {
        console.warn('[SnapAR] Failed to initialize Camera Kit:', err);
        initPromiseRef.current = null;
        return null;
      } finally {
        setIsLoading(false);
      }
    })();

    return initPromiseRef.current;
  }, []);

  // Initialize on mount if token is available
  useEffect(() => {
    if (SNAP_API_TOKEN) {
      initCameraKit();
    }
  }, [initCameraKit]);

  const applySnapLens = useCallback(async (lensId: string, groupId: string): Promise<boolean> => {
    try {
      const kit = await initCameraKit();
      if (!kit) return false;

      setIsLoading(true);
      const session = sessionRef.current || await kit.createSession();
      sessionRef.current = session;

      // Load lens from Snap's CDN
      const lens = await kit.lensRepository.loadLens(lensId, groupId);
      await session.applyLens(lens);
      
      console.log(`[SnapAR] Applied lens: ${lensId}`);
      return true;
    } catch (err) {
      console.error('[SnapAR] Failed to apply lens:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [initCameraKit]);

  const removeSnapLens = useCallback(async () => {
    try {
      if (sessionRef.current) {
        await sessionRef.current.removeLens();
        console.log('[SnapAR] Lens removed');
      }
    } catch (err) {
      console.warn('[SnapAR] Failed to remove lens:', err);
    }
  }, []);

  return (
    <SnapARContext.Provider
      value={{
        isAvailable,
        isLoading,
        session: sessionRef.current,
        applySnapLens,
        removeSnapLens,
      }}
    >
      {children}
    </SnapARContext.Provider>
  );
}
