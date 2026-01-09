import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
  downlink: number; // Mbps
  rtt: number; // Round-trip time in ms
  saveData: boolean;
  isSlowConnection: boolean;
  isFastConnection: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => ({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    effectiveType: 'unknown',
    downlink: 10,
    rtt: 50,
    saveData: false,
    isSlowConnection: false,
    isFastConnection: true,
  }));

  const updateNetworkInfo = useCallback(() => {
    const connection = (navigator as any).connection ||
                       (navigator as any).mozConnection ||
                       (navigator as any).webkitConnection;

    const isOnline = navigator.onLine;
    const effectiveType = connection?.effectiveType || 'unknown';
    const downlink = connection?.downlink || 10;
    const rtt = connection?.rtt || 50;
    const saveData = connection?.saveData || false;

    const isSlowConnection = 
      effectiveType === 'slow-2g' || 
      effectiveType === '2g' || 
      downlink < 1 ||
      rtt > 500;

    const isFastConnection = 
      effectiveType === '4g' && 
      downlink >= 5 &&
      rtt < 100;

    setStatus({
      isOnline,
      effectiveType,
      downlink,
      rtt,
      saveData,
      isSlowConnection,
      isFastConnection,
    });
  }, []);

  useEffect(() => {
    updateNetworkInfo();

    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      updateNetworkInfo();
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', updateNetworkInfo);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      connection?.removeEventListener?.('change', updateNetworkInfo);
    };
  }, [updateNetworkInfo]);

  return status;
}

// Hook to adapt media loading based on network
export function useAdaptiveMedia() {
  const { isSlowConnection, saveData, isOnline } = useNetworkStatus();

  return {
    // Should we load lower quality images?
    useLowQuality: isSlowConnection || saveData,
    // Should we defer video autoplay?
    deferVideos: isSlowConnection || saveData,
    // Should we preload media?
    shouldPreload: !isSlowConnection && !saveData && isOnline,
    // Max items to preload
    preloadCount: isSlowConnection ? 1 : saveData ? 2 : 5,
    // Should we show placeholders longer?
    extendedPlaceholders: isSlowConnection,
  };
}
