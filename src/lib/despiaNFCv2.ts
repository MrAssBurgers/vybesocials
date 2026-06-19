/**
 * Despia NFC — official `nfc://read` / `nfc://write` + `window.onNFCEvent`.
 * @see https://setup.despia.com (NFC page)
 *
 * Each scheme call is one-shot: one tag per `nfc://read` or `nfc://write`.
 * Never fire read and write in the same user gesture.
 *
 * Setup: Apple App ID → NFC Tag Reading, Despia Editor → NFC addon ON, rebuild.
 */

import { despiaCall, isDespiaRuntime } from './despiaBridge';
import { mapNfcErrorMessage } from './nfcPlatform';

export type NFCEventType = 'read' | 'write' | 'dismissed' | 'error';

export interface NFCEvent {
  type: NFCEventType;
  id?: string;
  data?: string;
  error?: string;
}

type Listener = (evt: NFCEvent) => boolean; // return true if consumed

const listeners = new Set<Listener>();
let installed = false;

/** Call once at app startup (see Despia docs). Safe to call multiple times. */
export function installDespiaNfcDispatcher(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as Window & { onNFCEvent?: (evt: NFCEvent) => void };
  const prev = w.onNFCEvent;
  w.onNFCEvent = (evt: NFCEvent) => {
    try {
      for (const l of Array.from(listeners)) {
        try {
          if (l(evt)) {
            listeners.delete(l);
            break;
          }
        } catch (err) {
          console.warn('[despiaNFCv2] listener threw', err);
        }
      }
    } finally {
      if (typeof prev === 'function') {
        try {
          prev(evt);
        } catch {
          /* ignore */
        }
      }
    }
  };
}

function installDispatcher(): void {
  installDespiaNfcDispatcher();
}

function once(matcher: (evt: NFCEvent) => boolean, timeoutMs: number): Promise<NFCEvent | null> {
  installDispatcher();
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      listeners.delete(listener);
      resolve(null);
    }, timeoutMs);
    const listener: Listener = (evt) => {
      if (!matcher(evt)) return false;
      if (settled) return true;
      settled = true;
      clearTimeout(timer);
      resolve(evt);
      return true;
    };
    listeners.add(listener);
  });
}

export interface DespiaNFCReadResult {
  ok: boolean;
  payload?: string;
  tagId?: string;
  dismissed?: boolean;
  error?: string;
}

/** Persistent listener for Despia `window.onNFCEvent` (does not auto-remove on first event). */
export function subscribeDespiaNfcEvents(handler: (evt: NFCEvent) => void): () => void {
  installDispatcher();
  const listener: Listener = (evt) => {
    try {
      handler(evt);
    } catch (err) {
      console.warn('[despiaNFCv2] subscriber threw', err);
    }
    return false;
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function despiaReadNFC(timeoutMs = 60_000): Promise<DespiaNFCReadResult> {
  if (!isDespiaRuntime()) return { ok: false, error: 'not_despia' };
  const pending = once(
    (evt) => evt.type === 'read' || evt.type === 'dismissed' || evt.type === 'error',
    timeoutMs,
  );
  void despiaCall('nfc://read');
  const evt = await pending;
  if (!evt) return { ok: false, error: 'timeout' };
  if (evt.type === 'read') return { ok: true, payload: evt.data ?? '', tagId: evt.id };
  if (evt.type === 'dismissed') return { ok: false, dismissed: true };
  return { ok: false, error: mapNfcErrorMessage(evt.error) };
}

export interface DespiaNFCWriteResult {
  ok: boolean;
  dismissed?: boolean;
  error?: string;
}

export interface DespiaNfcReadLoopOptions {
  onPayload: (data: string, tagId?: string) => void;
  onDismissed?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
  /** Ms before re-arming `nfc://read` after dismiss/error (not after success). */
  rearmDelayMs?: number;
}

/**
 * Friend Link / passive scan: arms one-shot `nfc://read`, re-arms after each
 * terminal event. Does NOT call `nfc://write` (per Despia: never both in one flow).
 */
export function startDespiaNfcReadLoop(options: DespiaNfcReadLoopOptions): () => void {
  if (!isDespiaRuntime()) return () => {};

  installDispatcher();
  let disposed = false;
  let readInFlight = false;

  const armRead = () => {
    if (disposed || readInFlight || options.signal?.aborted) return;
    readInFlight = true;
    void despiaCall('nfc://read').finally(() => {
      readInFlight = false;
    });
  };

  const scheduleRearm = (delayMs: number) => {
    window.setTimeout(() => {
      if (!disposed && !options.signal?.aborted) armRead();
    }, delayMs);
  };

  const unsub = subscribeDespiaNfcEvents((evt) => {
    if (disposed || options.signal?.aborted) return;

    if (evt.type === 'read' && evt.data) {
      options.onPayload(evt.data, evt.id);
      scheduleRearm(400);
      return;
    }
    if (evt.type === 'dismissed') {
      options.onDismissed?.();
      scheduleRearm(options.rearmDelayMs ?? 900);
      return;
    }
    if (evt.type === 'error') {
      options.onError?.(mapNfcErrorMessage(evt.error));
      scheduleRearm(options.rearmDelayMs ?? 1200);
    }
  });

  const onAbort = () => {
    disposed = true;
    unsub();
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) {
    onAbort();
    return () => {};
  }

  armRead();

  return () => {
    disposed = true;
    options.signal?.removeEventListener('abort', onAbort);
    unsub();
  };
}

export async function despiaWriteNFC(value: string, timeoutMs = 60_000): Promise<DespiaNFCWriteResult> {
  if (!isDespiaRuntime()) return { ok: false, error: 'not_despia' };
  if (!value) return { ok: false, error: 'empty_value' };
  const pending = once(
    (evt) => evt.type === 'write' || evt.type === 'dismissed' || evt.type === 'error',
    timeoutMs,
  );
  void despiaCall(`nfc://write?value=${encodeURIComponent(value)}`);
  const evt = await pending;
  if (!evt) return { ok: false, error: 'timeout' };
  if (evt.type === 'write') return { ok: true };
  if (evt.type === 'dismissed') return { ok: false, dismissed: true };
  return { ok: false, error: mapNfcErrorMessage(evt.error) || 'write_error' };
}
