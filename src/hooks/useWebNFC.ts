import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web NFC hook — works on Android Chrome (and Despia Android WebView).
 * iOS does not support Web NFC; the hook reports unavailable there.
 *
 * Permissions required: the hosting native shell (Despia) must enable NFC
 * in its app capability settings AND the user must grant runtime permission.
 */

export interface NFCRecord {
  recordType: string;
  mediaType?: string;
  data: string;
}

export interface NFCReadEvent {
  serialNumber: string;
  records: NFCRecord[];
  raw: any;
}

interface UseWebNFCOptions {
  onRead?: (event: NFCReadEvent) => void;
  autoStart?: boolean;
}

export function useWebNFC({ onRead, autoStart = false }: UseWebNFCOptions = {}) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    setIsAvailable(typeof window !== 'undefined' && 'NDEFReader' in window);
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
      abortRef.current = null;
    }
    readerRef.current = null;
    setIsScanning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!('NDEFReader' in window)) {
      setError('NFC is not supported on this device');
      return false;
    }
    try {
      const Ctor = (window as any).NDEFReader;
      const reader = new Ctor();
      readerRef.current = reader;
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      await reader.scan({ signal: ctrl.signal });
      setIsScanning(true);

      reader.onreadingerror = (e: any) => {
        console.warn('[NFC] reading error', e);
      };

      reader.onreading = (event: any) => {
        const decoder = new TextDecoder();
        const records: NFCRecord[] = (event.message?.records || []).map((r: any) => {
          let data = '';
          try { data = decoder.decode(r.data); } catch { data = ''; }
          return { recordType: r.recordType, mediaType: r.mediaType, data };
        });
        onReadRef.current?.({
          serialNumber: event.serialNumber,
          records,
          raw: event,
        });
      };
      return true;
    } catch (err: any) {
      console.error('[NFC] start failed', err);
      setError(err?.message || 'Failed to start NFC');
      setIsScanning(false);
      return false;
    }
  }, []);

  useEffect(() => {
    if (autoStart && isAvailable) {
      start();
    }
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, isAvailable]);

  return { isAvailable, isScanning, error, start, stop };
}
