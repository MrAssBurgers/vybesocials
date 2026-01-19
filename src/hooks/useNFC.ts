import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

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
      data: string;
    }>;
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
        for (const record of event.message.records) {
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const text = decoder.decode(record.data);

            if (text.startsWith('vybe:friend:')) {
              onTagScanned(text.replace('vybe:friend:', ''));
              return;
            }
          }
        }
      });

      ndef.addEventListener('readingerror', () => {
        setState(prev => ({ ...prev, error: 'Cannot read from NFC tag' }));
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

  // Write NDEF message using Web NFC
  const writeNFC = useCallback(async (userId: string): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      toast.error('NFC writing not supported on this device');
      return false;
    }

    try {
      const ndef = new window.NDEFReader();
      abortControllerRef.current = new AbortController();

      await ndef.write(
        {
          records: [
            {
              recordType: 'text',
              data: `vybe:friend:${userId}`,
            },
          ],
        },
        { signal: abortControllerRef.current.signal }
      );

      toast.success('Ready to share! Tap phones together.');
      return true;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied');
      } else if (error.name === 'AbortError') {
        // User cancelled
        return false;
      } else {
        toast.error('Failed to prepare NFC share');
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
  };
}
