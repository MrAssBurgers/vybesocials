import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';
import { isDespiaRuntime, despiaCall, despiaScanNFC, openAppSettings, isAndroidUA, isIOSUA } from '@/lib/despiaBridge';

interface NFCState {
  isSupported: boolean;
  isEnabled: boolean;
  isScanning: boolean;
  isWriteReady: boolean;
  error: string | null;
}

// Web NFC API types (Chrome Android 89+)
declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
  }
  
  interface NDEFReader {
    scan(options?: { signal?: AbortSignal }): Promise<void>;
    write(message: NDEFMessageInit, options?: { signal?: AbortSignal }): Promise<void>;
    addEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void;
    addEventListener(type: 'readingerror', listener: () => void): void;
    removeEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void;
    removeEventListener(type: 'readingerror', listener: () => void): void;
  }
  
  interface NDEFReadingEvent {
    message: {
      records: NDEFRecord[];
    };
    serialNumber?: string;
  }
  
  interface NDEFRecord {
    recordType: string;
    data: ArrayBuffer;
    encoding?: string;
  }
  
  interface NDEFMessageInit {
    records: Array<{
      recordType: string;
      data?: string;
      mediaType?: string;
      id?: string;
    }>;
  }
}

// Deep link URL for the app
const APP_DOMAIN = 'vybehub.app';
const FRIEND_ADD_PATH = '/add-friend';

export function generateFriendAddUrl(userId: string): string {
  return `https://${APP_DOMAIN}${FRIEND_ADD_PATH}/${userId}`;
}

export function parseFriendAddUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  } catch {
    if (url.startsWith('vybe:friend:')) {
      return url.replace('vybe:friend:', '');
    }
    return null;
  }
}

// Detect if running on Chrome Android (only platform supporting Web NFC)
function isWebNFCSupported(): boolean {
  if (typeof window === 'undefined') return false;

  // Web NFC requires the NDEFReader API, which only Chromium-based engines on Android expose.
  if (!('NDEFReader' in window)) return false;

  // Web NFC only works on Android (Chrome OR Despia/Chromium WebView). Edge is also fine.
  return isAndroidUA();
}

// Despia native NFC bridge — available in the wrapped Android app even when
// Web NFC permission has been denied. Returns true if a payload was decoded.
async function despiaNFCScan(onTagScanned: (userId: string) => void): Promise<boolean> {
  // Try a few known Despia NFC bridge URLs — Despia has shipped under several names.
  const bridges = ['nfcread://', 'scannfc://', 'nfc://read'];
  for (const url of bridges) {
    const result = await despiaCall(url, ['nfcResult', 'payload', 'data', 'url'], 30_000);
    if (!result) continue;
    const raw =
      result.nfcResult || result.payload || result.data || result.url || '';
    if (typeof raw !== 'string' || !raw) continue;
    const userId = parseFriendAddUrl(raw);
    if (userId) {
      onTagScanned(userId);
      return true;
    }
    if (raw.startsWith('vybe:friend:')) {
      onTagScanned(raw.replace('vybe:friend:', ''));
      return true;
    }
  }
  return false;
}

export function useNFC() {
  const [state, setState] = useState<NFCState>({
    isSupported: false,
    isEnabled: false,
    isScanning: false,
    isWriteReady: false,
    error: null,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const ndefReaderRef = useRef<NDEFReader | null>(null);
  const pendingWriteRef = useRef<string | null>(null);

  const hasWebNFC = isWebNFCSupported();
  // The Despia native shell on Android exposes its own NFC bridge even when
  // Web NFC permission is denied. Treat that as supported too.
  const hasDespiaNFC = isDespiaRuntime() && isAndroidUA();
  const nfcSupported = hasWebNFC || hasDespiaNFC;

  useEffect(() => {
    console.log('[NFC] hasWebNFC:', hasWebNFC, 'hasDespiaNFC:', hasDespiaNFC);
    setState(prev => ({
      ...prev,
      isSupported: nfcSupported,
      isEnabled: nfcSupported,
    }));
  }, [hasWebNFC, hasDespiaNFC, nfcSupported]);

  // Request permission by starting a scan
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      console.log('[NFC] Cannot request permission - not supported');
      return false;
    }

    try {
      console.log('[NFC] Requesting permission...');
      const ndef = new window.NDEFReader();
      const controller = new AbortController();
      
      await ndef.scan({ signal: controller.signal });
      console.log('[NFC] Permission granted');
      controller.abort();
      
      return true;
    } catch (error: any) {
      console.error('[NFC] Permission failed:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Allow NFC in browser settings.');
        return false;
      }
      if (error.name === 'AbortError') {
        return true;
      }
      return false;
    }
  }, [hasWebNFC]);

  // Start scanning for NFC tags
  const startScan = useCallback(async (onTagScanned: (userId: string) => void): Promise<boolean> => {
    // Inside the Despia Android shell, prefer the native NFC bridge — it works
    // even when Web NFC permission has been denied or the WebView blocks it.
    if (hasDespiaNFC) {
      setState(prev => ({ ...prev, isScanning: true, error: null }));
      haptics.tap();
      toast.success('NFC scanning! Hold your phone near a tag or another device.');
      const ok = await despiaNFCScan(onTagScanned);
      setState(prev => ({ ...prev, isScanning: false }));
      if (!ok) {
        toast.info('No VYBE data found on that tag');
      } else {
        haptics.success();
      }
      return ok;
    }

    if (!hasWebNFC || !window.NDEFReader) {
      console.log('[NFC] Scan failed - not supported');
      if (isIOSUA()) {
        toast.error('NFC not available in iOS browsers. Install the native app for NFC.');
      } else if (isAndroidUA()) {
        toast.error('NFC requires Chrome browser on Android.');
      } else {
        toast.error('NFC is only available on Android with Chrome browser.');
      }
      return false;
    }

    // Stop existing scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    try {
      console.log('[NFC] Starting scan...');
      const ndef = new window.NDEFReader();
      ndefReaderRef.current = ndef;
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });
      console.log('[NFC] Scan active');
      
      setState(prev => ({ ...prev, isScanning: true, error: null }));
      haptics.tap();
      toast.success('NFC scanning! Hold phone near NFC tag or friend\'s phone.');

      const handleReading = (event: NDEFReadingEvent) => {
        console.log('[NFC] Tag detected:', event.serialNumber);
        haptics.success();

        for (const record of event.message.records) {
          console.log('[NFC] Record type:', record.recordType);
          
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            const url = decoder.decode(record.data);
            console.log('[NFC] URL:', url);
            const userId = parseFriendAddUrl(url);
            if (userId) {
              onTagScanned(userId);
              return;
            }
          }
          
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const text = decoder.decode(record.data);
            console.log('[NFC] Text:', text);

            const userId = parseFriendAddUrl(text);
            if (userId) {
              onTagScanned(userId);
              return;
            }
            
            if (text.startsWith('vybe:friend:')) {
              onTagScanned(text.replace('vybe:friend:', ''));
              return;
            }
          }
        }
        
        toast.info('NFC tag read, but no VYBE data found');
      };

      const handleError = () => {
        console.error('[NFC] Read error');
        setState(prev => ({ ...prev, error: 'Cannot read NFC tag' }));
        haptics.error();
        toast.error('Failed to read NFC tag');
      };

      ndef.addEventListener('reading', handleReading);
      ndef.addEventListener('readingerror', handleError);

      return true;
    } catch (error: any) {
      console.error('[NFC] Scan failed:', error);
      setState(prev => ({ ...prev, isScanning: false }));

      if (error.name === 'NotAllowedError') {
        // Permission denied — try the Despia native bridge as a last resort.
        if (isDespiaRuntime() && isAndroidUA()) {
          const ok = await despiaNFCScan(onTagScanned);
          if (ok) return true;
        }
        toast.error('NFC permission denied. Tap the gear icon to open app settings.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC is turned off. Enable NFC in your phone settings.');
      } else if (error.name === 'AbortError') {
        return false;
      } else {
        console.warn('[NFC] Start failed:', error.message);
      }
      return false;
    }
  }, [hasWebNFC, hasDespiaNFC]);

  const stopScan = useCallback(() => {
    console.log('[NFC] Stopping scan');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    ndefReaderRef.current = null;
    pendingWriteRef.current = null;
    setState(prev => ({ ...prev, isScanning: false, isWriteReady: false }));
  }, []);

  // Write to NFC tag
  const writeNFC = useCallback(async (userId: string): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      toast.error('NFC not supported on this device');
      return false;
    }

    try {
      console.log('[NFC] Preparing write for:', userId);
      const ndef = new window.NDEFReader();
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const friendUrl = generateFriendAddUrl(userId);
      console.log('[NFC] URL to write:', friendUrl);
      
      await ndef.scan({ signal: abortControllerRef.current.signal });
      
      setState(prev => ({ ...prev, isScanning: true, isWriteReady: true }));
      pendingWriteRef.current = userId;
      
      haptics.tap();
      toast.success('NFC ready! Tap an NFC tag to write your profile.');

      ndef.addEventListener('reading', async () => {
        if (!pendingWriteRef.current) return;
        
        console.log('[NFC] Tag detected, writing...');
        haptics.impact();
        
        try {
          await ndef.write({
            records: [{ recordType: 'url', data: generateFriendAddUrl(pendingWriteRef.current) }],
          });
          
          console.log('[NFC] Write success');
          haptics.success();
          toast.success('Profile written to NFC tag!');
          
          pendingWriteRef.current = null;
          setState(prev => ({ ...prev, isWriteReady: false }));
        } catch (writeError) {
          console.error('[NFC] Write failed:', writeError);
          haptics.error();
          toast.error('Failed to write to tag');
        }
      });

      return true;
    } catch (error: any) {
      console.error('[NFC] Write setup failed:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied');
      } else if (error.name !== 'AbortError') {
        toast.error('Failed to prepare NFC');
      }
      return false;
    }
  }, [hasWebNFC]);

  // Bidirectional share - scan and prepare to exchange
  const shareProfile = useCallback(async (userId: string, onReceive: (theirUserId: string) => void): Promise<boolean> => {
    // Despia native NFC bridge fallback (Android shell only).
    if (hasDespiaNFC && (!hasWebNFC || !window.NDEFReader)) {
      setState(prev => ({ ...prev, isScanning: true, isWriteReady: true, error: null }));
      haptics.impact();
      toast.success('NFC Ready! Hold phones together back-to-back.', { duration: 5000 });
      const ok = await despiaNFCScan((theirId) => {
        if (theirId !== userId) onReceive(theirId);
      });
      setState(prev => ({ ...prev, isScanning: false, isWriteReady: false }));
      return ok;
    }

    if (!hasWebNFC || !window.NDEFReader) {
      if (isIOSUA()) {
        toast.error('NFC not available in iOS browsers. Use the share link instead!', { duration: 5000 });
      } else if (isAndroidUA()) {
        toast.error('NFC requires Chrome browser on Android.');
      } else {
        toast.error('NFC only works on Android with Chrome browser.');
      }
      return false;
    }

    console.log('[NFC] Starting bidirectional share:', userId);
    stopScan();
    
    try {
      const ndef = new window.NDEFReader();
      ndefReaderRef.current = ndef;
      abortControllerRef.current = new AbortController();
      
      await ndef.scan({ signal: abortControllerRef.current.signal });
      
      setState(prev => ({ ...prev, isScanning: true, isWriteReady: true, error: null }));
      pendingWriteRef.current = userId;
      
      console.log('[NFC] Bidirectional share active');
      haptics.impact();
      toast.success('NFC Ready! Both phones need the app open and scanning.', {
        description: 'Hold phones together back-to-back',
        duration: 5000,
      });

      ndef.addEventListener('reading', async (event: NDEFReadingEvent) => {
        console.log('[NFC] Device/tag detected');
        haptics.success();
        
        let foundTheirProfile = false;
        for (const record of event.message.records) {
          if (record.recordType === 'url' || record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const data = decoder.decode(record.data);
            const theirUserId = parseFriendAddUrl(data);
            
            if (theirUserId && theirUserId !== userId) {
              console.log('[NFC] Found their profile:', theirUserId);
              foundTheirProfile = true;
              onReceive(theirUserId);
              break;
            }
          }
        }
        
        if (pendingWriteRef.current) {
          try {
            await ndef.write({
              records: [{ recordType: 'url', data: generateFriendAddUrl(userId) }],
            });
            console.log('[NFC] Wrote our profile');
            if (!foundTheirProfile) {
              toast.success('Profile shared via NFC!');
            }
          } catch {
            console.log('[NFC] Could not write (normal for phone-to-phone)');
          }
        }
      });

      return true;
    } catch (error: any) {
      console.error('[NFC] Share failed:', error);
      
      if (error.name === 'NotAllowedError') {
        // Try Despia native bridge as fallback when permission denied.
        if (isDespiaRuntime() && isAndroidUA()) {
          const ok = await despiaNFCScan((theirId) => {
            if (theirId !== userId) onReceive(theirId);
          });
          if (ok) return true;
        }
        toast.error('NFC permission denied. Tap the gear icon to open app settings.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC is turned off. Enable NFC in your phone settings.');
      } else if (error.name !== 'AbortError') {
        console.warn('[NFC] Share start failed:', error.message);
      }
      return false;
    }
  }, [hasWebNFC, hasDespiaNFC, stopScan]);

  const openSettings = useCallback(() => {
    if (isDespiaRuntime()) {
      toast.info('Opening app settings…', {
        description: 'Enable NFC permission, then return to VYBE.',
      });
      void openAppSettings();
      return;
    }
    if (isIOSUA()) {
      toast.info('Open Settings → VYBE and enable NFC', { duration: 5000 });
      window.location.href = 'app-settings:';
      return;
    }
    toast.info('Enable NFC in your device settings', {
      description: 'Settings → Connected devices → NFC',
    });
  }, []);

  // Get a user-friendly status message
  const getStatusMessage = useCallback((): string => {
    if (nfcSupported) return 'NFC available';
    if (isIOSUA()) return 'NFC not available in iOS browsers';
    if (isAndroidUA()) return 'Enable NFC permission for VYBE';
    return 'NFC only works on Android phones';
  }, [nfcSupported]);

  return {
    ...state,
    hasWebNFC,
    requestPermission,
    startScan,
    stopScan,
    writeNFC,
    shareProfile,
    openSettings,
    getStatusMessage,
    generateFriendAddUrl,
    parseFriendAddUrl,
  };
}