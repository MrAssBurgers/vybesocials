import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

interface NFCState {
  isSupported: boolean;
  isEnabled: boolean;
  isScanning: boolean;
  isWriteReady: boolean;
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
    isWriteReady: false,
    error: null,
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const ndefReaderRef = useRef<NDEFReader | null>(null);
  const pendingWriteRef = useRef<string | null>(null);

  const isNative = Capacitor.isNativePlatform();
  const hasWebNFC = typeof window !== 'undefined' && 'NDEFReader' in window;

  useEffect(() => {
    console.log('[NFC] Checking Web NFC support...');
    console.log('[NFC] hasWebNFC:', hasWebNFC);
    console.log('[NFC] isNative:', isNative);
    
    if (hasWebNFC) {
      console.log('[NFC] Web NFC is supported!');
      setState(prev => ({
        ...prev,
        isSupported: true,
        isEnabled: true,
      }));
    } else {
      console.log('[NFC] Web NFC is NOT supported on this device/browser');
      setState(prev => ({ ...prev, isSupported: false }));
    }
  }, [hasWebNFC, isNative]);

  // Request NFC permission by initiating a scan
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      console.log('[NFC] Cannot request permission - Web NFC not available');
      return false;
    }

    try {
      console.log('[NFC] Requesting NFC permission...');
      const ndef = new window.NDEFReader();
      const controller = new AbortController();
      
      // This triggers the permission prompt
      await ndef.scan({ signal: controller.signal });
      console.log('[NFC] Permission granted!');
      
      // Immediately abort - we just needed permission
      controller.abort();
      
      return true;
    } catch (error: any) {
      console.error('[NFC] Permission request failed:', error);
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Please allow NFC access in your browser settings.');
        return false;
      }
      if (error.name === 'AbortError') {
        // This is expected since we abort immediately
        return true;
      }
      return false;
    }
  }, [hasWebNFC]);

  // Start scanning for NFC tags
  const startScan = useCallback(async (onTagScanned: (userId: string) => void): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      console.log('[NFC] Scan failed - Web NFC not available');
      toast.error('NFC is not available. Use Chrome on Android with NFC enabled.');
      return false;
    }

    // Stop any existing scan first
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    try {
      console.log('[NFC] Starting NFC scan...');
      const ndef = new window.NDEFReader();
      ndefReaderRef.current = ndef;
      abortControllerRef.current = new AbortController();

      // Request permission and start scanning
      await ndef.scan({ signal: abortControllerRef.current.signal });
      console.log('[NFC] Scan started successfully!');
      
      setState(prev => ({ ...prev, isScanning: true, error: null }));
      haptics.tap();
      toast.success('NFC is active! Ready to read tags.');

      // Handle reading events
      const handleReading = (event: NDEFReadingEvent) => {
        console.log('[NFC] Tag detected!', event.serialNumber);
        haptics.success();

        for (const record of event.message.records) {
          console.log('[NFC] Record type:', record.recordType);
          
          if (record.recordType === 'url') {
            const decoder = new TextDecoder();
            const url = decoder.decode(record.data);
            console.log('[NFC] URL record:', url);
            const userId = parseFriendAddUrl(url);
            if (userId) {
              console.log('[NFC] Extracted userId:', userId);
              onTagScanned(userId);
              return;
            }
          }
          
          if (record.recordType === 'text') {
            const decoder = new TextDecoder(record.encoding || 'utf-8');
            const text = decoder.decode(record.data);
            console.log('[NFC] Text record:', text);

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
        
        console.log('[NFC] No valid VYBE data found in tag');
        toast.info('NFC tag read, but no VYBE friend data found');
      };

      const handleError = () => {
        console.error('[NFC] Read error occurred');
        setState(prev => ({ ...prev, error: 'Cannot read from NFC tag' }));
        haptics.error();
        toast.error('Failed to read NFC tag. Try again.');
      };

      ndef.addEventListener('reading', handleReading);
      ndef.addEventListener('readingerror', handleError);

      return true;
    } catch (error: any) {
      console.error('[NFC] Scan failed:', error);
      setState(prev => ({ ...prev, isScanning: false }));
      
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Please allow NFC access.');
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC not supported on this device.');
      } else if (error.name === 'AbortError') {
        console.log('[NFC] Scan was aborted');
        return false;
      } else {
        toast.error('Failed to start NFC scan');
      }
      return false;
    }
  }, [hasWebNFC]);

  // Stop scanning
  const stopScan = useCallback(() => {
    console.log('[NFC] Stopping scan...');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    ndefReaderRef.current = null;
    pendingWriteRef.current = null;
    setState(prev => ({ ...prev, isScanning: false, isWriteReady: false }));
  }, []);

  // Write to NFC tag (requires user to tap a physical NFC tag)
  const writeNFC = useCallback(async (userId: string): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      console.log('[NFC] Write failed - Web NFC not available');
      toast.error('NFC writing not supported on this device');
      return false;
    }

    try {
      console.log('[NFC] Preparing to write...', userId);
      const ndef = new window.NDEFReader();
      
      // Create new abort controller for write operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const friendUrl = generateFriendAddUrl(userId);
      console.log('[NFC] Will write URL:', friendUrl);
      
      // First scan to request permission
      console.log('[NFC] Requesting permission via scan...');
      await ndef.scan({ signal: abortControllerRef.current.signal });
      console.log('[NFC] Permission granted, ready to write');
      
      setState(prev => ({ ...prev, isScanning: true, isWriteReady: true }));
      pendingWriteRef.current = userId;
      
      haptics.tap();
      toast.success('NFC active! Tap an NFC tag to write your profile', {
        description: 'Or tap another phone running VYBE to share directly',
        duration: 5000,
      });

      // Listen for tags and write to them
      ndef.addEventListener('reading', async () => {
        if (!pendingWriteRef.current) return;
        
        console.log('[NFC] Tag detected, writing...');
        haptics.impact();
        
        try {
          await ndef.write({
            records: [
              {
                recordType: 'url',
                data: generateFriendAddUrl(pendingWriteRef.current),
              },
            ],
          });
          
          console.log('[NFC] Write successful!');
          haptics.success();
          toast.success('Profile written to NFC tag!', {
            description: 'Anyone can tap this tag to add you as a friend',
          });
          
          pendingWriteRef.current = null;
          setState(prev => ({ ...prev, isWriteReady: false }));
        } catch (writeError) {
          console.error('[NFC] Write failed:', writeError);
          haptics.error();
          toast.error('Failed to write to tag. Make sure the tag is writable.');
        }
      });

      return true;
    } catch (error: any) {
      console.error('[NFC] Write setup failed:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Please allow NFC in browser settings.');
      } else if (error.name === 'AbortError') {
        return false;
      } else if (error.name === 'NotSupportedError') {
        toast.error('NFC not supported on this device');
      } else {
        haptics.error();
        toast.error('Failed to prepare NFC share');
      }
      return false;
    }
  }, [hasWebNFC]);

  // Share profile - starts scan and prepares for write
  const shareProfile = useCallback(async (userId: string, onReceive: (theirUserId: string) => void): Promise<boolean> => {
    if (!hasWebNFC || !window.NDEFReader) {
      toast.error('NFC not available. Use Chrome on Android.');
      return false;
    }

    console.log('[NFC] Starting bidirectional share for:', userId);
    
    // Stop any existing operations
    stopScan();
    
    try {
      const ndef = new window.NDEFReader();
      ndefReaderRef.current = ndef;
      abortControllerRef.current = new AbortController();
      
      // Start scan to get permission and listen for tags
      await ndef.scan({ signal: abortControllerRef.current.signal });
      
      setState(prev => ({ ...prev, isScanning: true, isWriteReady: true, error: null }));
      pendingWriteRef.current = userId;
      
      console.log('[NFC] Bidirectional share active');
      haptics.impact();
      toast.success('NFC Ready!', {
        description: 'Tap phones together or tap an NFC tag',
        duration: 5000,
      });

      // Handle incoming tags - read AND write
      ndef.addEventListener('reading', async (event: NDEFReadingEvent) => {
        console.log('[NFC] Device/tag detected');
        haptics.success();
        
        // First, try to read their profile
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
        
        // Then try to write our profile (for NFC tags)
        if (pendingWriteRef.current) {
          try {
            await ndef.write({
              records: [{ recordType: 'url', data: generateFriendAddUrl(userId) }],
            });
            console.log('[NFC] Wrote our profile');
            if (!foundTheirProfile) {
              toast.success('Profile shared!');
            }
          } catch (e) {
            // Write might fail if it's not a writable tag - that's OK
            console.log('[NFC] Could not write (normal for phone-to-phone)');
          }
        }
      });

      return true;
    } catch (error: any) {
      console.error('[NFC] Share failed:', error);
      
      if (error.name === 'NotAllowedError') {
        toast.error('NFC permission denied. Enable NFC in settings.');
      } else if (error.name !== 'AbortError') {
        toast.error('Failed to start NFC sharing');
      }
      return false;
    }
  }, [hasWebNFC, stopScan]);

  // Open NFC settings
  const openSettings = useCallback(() => {
    toast.info('Please enable NFC in your device settings', {
      description: 'Settings → Connected devices → NFC',
    });
  }, []);

  return {
    ...state,
    isNative,
    hasWebNFC,
    requestPermission,
    startScan,
    stopScan,
    writeNFC,
    shareProfile,
    openSettings,
    generateFriendAddUrl,
    parseFriendAddUrl,
  };
}