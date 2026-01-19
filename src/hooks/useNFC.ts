import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

interface NFCState {
  isSupported: boolean;
  isEnabled: boolean;
  isScanning: boolean;
  error: string | null;
}

// Web NFC API types (for browsers that support it - Chrome Android 89+)
declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
  }
  
  interface NDEFReader {
    scan(options?: { signal?: AbortSignal }): Promise<void>;
    write(message: NDEFMessageInit, options?: { signal?: AbortSignal }): Promise<void>;
    addEventListener(type: 'reading', listener: (event: NDEFReadingEvent) => void): void;
    addEventListener(type: 'readingerror', listener: () => void): void;
  }
  
  interface NDEFReadingEvent {
    message: {
      records: NDEFRecord[];
    };
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

// Deep link / Universal link URL for the app
const APP_DOMAIN = 'vybehub.app';
const FRIEND_ADD_PATH = '/add-friend';

// Generate a friend add URL that works as deep link or web fallback
export function generateFriendAddUrl(userId: string): string {
  return `https://${APP_DOMAIN}${FRIEND_ADD_PATH}/${userId}`;
}

// Parse a friend add URL to extract user ID
export function parseFriendAddUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/\/add-friend\/([a-zA-Z0-9-]+)/);
    return match ? match[1] : null;
  } catch {
    // Try legacy format
    if (url.startsWith('vybe:friend:')) {
      return url.replace('vybe:friend:', '');
    }
    return null;
  }
}

export function useNFC() {
  const [state, setState] = useState<NFCState>({
    isSupported: false,
    isEnabled: false,
    isScanning: false,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const ndefReaderRef = useRef<NDEFReader | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const hasWebNFC = typeof window !== 'undefined' && 'NDEFReader' in window;

  useEffect(() => {
    // Web NFC API is supported on Chrome Android 89+
    if (hasWebNFC) {
      setState(prev => ({
        ...prev,
        isSupported: true,
        isEnabled: true, // Web NFC doesn't have a way to check if enabled beforehand
      }));
    } else {
      setState(prev => ({ ...prev, isSupported: false }));
    }
  }, [hasWebNFC]);

  // Start scanning for NFC tags using Web NFC API
  const startScan = useCallback(async (onTagScanned: (userId: string) => void): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      toast.error('NFC is not available on this device. Try Chrome on Android.');
      return false;
    }

    try {
      const ndef = new window.NDEFReader();
      ndefReaderRef.current = ndef;
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });
      setState(prev => ({ ...prev, isScanning: true, error: null }));

      ndef.addEventListener('reading', (event: NDEFReadingEvent) => {
        // Trigger haptic feedback when NFC is read
        haptics.success();

        for (const record of event.message.records) {
          // Handle URL records (new format)
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            const url = decoder.decode(record.data);
            const userId = parseFriendAddUrl(url);
            if (userId) {
              onTagScanned(userId);
              return;
            }
          }
          
          // Handle text records (legacy format)
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const text = decoder.decode(record.data);

            // Check for URL format first
            const userId = parseFriendAddUrl(text);
            if (userId) {
              onTagScanned(userId);
              return;
            }
            
            // Legacy format
            if (text.startsWith('vybe:friend:')) {
              onTagScanned(text.replace('vybe:friend:', ''));
              return;
            }
          }
        }
      });

      ndef.addEventListener('readingerror', () => {
        setState(prev => ({ ...prev, error: 'Cannot read from NFC tag' }));
        haptics.error();
        toast.error('Failed to read NFC tag');
      });

      return true;
    } catch (error: any) {
      setState(prev => ({ ...prev, isScanning: false }));
      
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Please allow NFC access.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC not supported on this device.');
      } else if (error.name === 'AbortError') {
        // User or code cancelled - no error needed
        return false;
      } else {
        toast.error('Failed to start NFC scan');
      }
      return false;
    }
  }, [hasWebNFC]);

  // Stop scanning
  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    ndefReaderRef.current = null;
    setState(prev => ({ ...prev, isScanning: false }));
  }, []);

  // Write NDEF message using Web NFC - uses URL record for better compatibility
  // This creates an NDEF message that acts like a physical NFC tag
  // Locked phones (with screen on) will show a notification when tapped
  const writeNFC = useCallback(async (userId: string): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      toast.error('NFC writing not supported on this device');
      return false;
    }

    try {
      const ndef = new window.NDEFReader();
      abortControllerRef.current = new AbortController();

      // Use URL record type - this is the key to working like a physical NFC tag
      // Android devices will show a notification even when locked (screen on)
      // iOS requires the app to be open, but will handle the URL
      const friendUrl = generateFriendAddUrl(userId);
      
      // First request permission by starting a scan (required for write access)
      try {
        await ndef.scan({ signal: abortControllerRef.current.signal });
      } catch (scanError: any) {
        // Permission denied or not supported
        if (scanError.name === 'NotAllowedError') {
          toast.error('NFC permission denied. Please allow NFC access.');
          return false;
        }
      }

      // Now write the NDEF message - this will be pushed when another device taps
      // Using 'url' record type makes it work like a physical NFC tag
      await ndef.write(
        {
          records: [
            {
              recordType: 'url',
              data: friendUrl,
            },
          ],
        },
        { signal: abortControllerRef.current.signal }
      );

      haptics.success();
      toast.success('NFC ready! Hold phones together', {
        description: 'Their phone will show a notification even if locked'
      });
      return true;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied');
      } else if (error.name === 'AbortError') {
        // User cancelled
        return false;
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC not supported on this device');
      } else {
        haptics.error();
        toast.error('Failed to prepare NFC share');
        console.error('NFC write error:', error);
      }
      return false;
    }
  }, [hasWebNFC]);

  // Open NFC settings - only works on some platforms
  const openSettings = useCallback(() => {
    toast.info('Please enable NFC in your device settings');
  }, []);

  return {
    ...state,
    isNative,
    hasWebNFC,
    startScan,
    stopScan,
    writeNFC,
    openSettings,
    generateFriendAddUrl,
    parseFriendAddUrl,
  };
}
