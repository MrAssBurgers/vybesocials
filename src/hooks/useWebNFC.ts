import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Web NFC hook — works on Android Chrome (and Despia Android WebView).
 * iOS does not support Web NFC; the hook reports unavailable there.
 *
 * Permissions required: the hosting native shell (Despia) must enable NFC
 * in its app capability settings AND the user must grant runtime permission.
 */

function isDespiaWebView(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('despia') || ua.includes('vybeapp');
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

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
      const msg = isIOS()
        ? 'NFC isn\'t supported on iOS — use the QR code instead'
        : isDespiaWebView()
          ? 'NFC unavailable in this app build — open in Chrome to scan'
          : 'NFC isn\'t supported on this device';
      setError(msg);
      toast.error(msg);
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
      toast.success('Hold a tag near your phone…', { duration: 3000 });

      reader.onreadingerror = (e: any) => {
        console.warn('[NFC] reading error', e);
        toast.error('Couldn\'t read that tag — try again');
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
      const name = err?.name || '';
      const msg =
        name === 'NotAllowedError'
          ? 'NFC permission denied — enable it in app settings'
          : name === 'NotSupportedError'
            ? 'NFC is disabled or unavailable on this device'
            : err?.message || 'Failed to start NFC';
      setError(msg);
      toast.error(msg);
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
