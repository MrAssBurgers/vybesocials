import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

type NfcStatus = 'enabled' | 'disabled' | 'none';

interface NFCState {
  isSupported: boolean;
  isEnabled: boolean;
  isScanning: boolean;
  error: string | null;
}

// Web NFC API types (for browsers that support it)
declare global {
  interface Window {
    NDEFReader?: any;
    NDEFMessage?: any;
  }
}

export function useNFC() {
  const [state, setState] = useState<NFCState>({
    isSupported: false,
    isEnabled: false,
    isScanning: false,
    error: null,
  });
  const [nfcPlugin, setNfcPlugin] = useState<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const hasWebNFC = typeof window !== 'undefined' && 'NDEFReader' in window;

  useEffect(() => {
    const initNFC = async () => {
      // Try native Capacitor plugin first
      if (isNative) {
        try {
          const { NFC } = await import('capacitor-nfc');
          setNfcPlugin(NFC);

          const { status } = await NFC.getStatus();
          setState(prev => ({
            ...prev,
            isSupported: status !== 'none',
            isEnabled: status === 'enabled',
          }));
          return;
        } catch (error) {
          console.log('Native NFC plugin not available:', error);
        }
      }

      // Fall back to Web NFC API (Chrome Android 89+)
      if (hasWebNFC) {
        setState(prev => ({
          ...prev,
          isSupported: true,
          isEnabled: true, // Web NFC doesn't have a way to check if enabled
        }));
        return;
      }

      // NFC not supported
      setState(prev => ({ ...prev, isSupported: false }));
    };

    initNFC();
  }, [isNative, hasWebNFC]);

  // Start scanning for NFC tags using Web NFC API
  const startWebNFCScan = useCallback(async (onTagScanned: (data: string) => void): Promise<boolean> => {
    if (!hasWebNFC) return false;

    try {
      const ndef = new window.NDEFReader();
      abortControllerRef.current = new AbortController();

      await ndef.scan({ signal: abortControllerRef.current.signal });
      setState(prev => ({ ...prev, isScanning: true }));

      ndef.addEventListener('reading', ({ message }: any) => {
        for (const record of message.records) {
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding);
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
      });

      return true;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Please allow NFC access.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC not supported on this device.');
      }
      return false;
    }
  }, [hasWebNFC]);

  // Start scanning for NFC tags using Capacitor plugin
  const startNativeScan = useCallback(async (onTagScanned: (data: string) => void): Promise<boolean> => {
    if (!nfcPlugin) return false;

    try {
      // Check status first
      const { status } = await nfcPlugin.getStatus();
      if (status !== 'enabled') {
        toast.error('Please enable NFC in your device settings');
        return false;
      }

      await nfcPlugin.startScanning({ ndefEnabled: true });
      setState(prev => ({ ...prev, isScanning: true }));

      // The plugin uses events - set up listener
      // Note: This basic plugin doesn't support NDEF reading well,
      // so we'll use the tag ID as a fallback mechanism
      const tagInfo = await nfcPlugin.getTagInfo();
      if (tagInfo?.tagId) {
        // For basic NFC, we can't read custom data, but we can use tagId
        onTagScanned(tagInfo.tagId);
      }

      return true;
    } catch (error: any) {
      console.error('Native NFC scan error:', error);
      return false;
    }
  }, [nfcPlugin]);

  // Main scan function
  const startScan = useCallback(async (onTagScanned: (userId: string) => void): Promise<boolean> => {
    if (!state.isSupported) {
      toast.error('NFC is not available on this device');
      return false;
    }

    setState(prev => ({ ...prev, error: null }));

    // Prefer Web NFC if available (better NDEF support)
    if (hasWebNFC) {
      return startWebNFCScan(onTagScanned);
    }

    // Fall back to native plugin
    if (nfcPlugin) {
      return startNativeScan(onTagScanned);
    }

    return false;
  }, [state.isSupported, hasWebNFC, nfcPlugin, startWebNFCScan, startNativeScan]);

  // Stop scanning
  const stopScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({ ...prev, isScanning: false }));
  }, []);

  // Write NDEF message using Web NFC
  const writeNFC = useCallback(async (userId: string): Promise<boolean> => {
    if (!hasWebNFC) {
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

  // Open NFC settings (native only)
  const openSettings = useCallback(async () => {
    if (nfcPlugin) {
      try {
        await nfcPlugin.showSettings();
      } catch (error) {
        toast.error('Could not open NFC settings');
      }
    }
  }, [nfcPlugin]);

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
