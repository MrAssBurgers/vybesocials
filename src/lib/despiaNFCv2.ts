/**
 * Despia NFC v2 — new `nfc://read` / `nfc://write` contract with `window.onNFCEvent`.
 *
 * Multiplexes a single shared `window.onNFCEvent` dispatcher across concurrent
 * callers. Each call installs a one-shot listener that resolves on the first
 * matching event for that session and then unsubscribes.
 *
 * Requirements (one-time setup per Despia docs):
 *   1. Enable "NFC Tag Reading" capability on the Apple App ID.
 *   2. Toggle "NFC" addon ON in the Despia Editor.
 *   3. Rebuild the native binary — without rebuild calls resolve silently.
 */

import { despiaCall, isDespiaRuntime } from './despiaBridge';

type NFCEventType = 'read' | 'write' | 'dismissed' | 'error';

interface NFCEvent {
  type: NFCEventType;
  id?: string;
  data?: string;
  error?: string;
}

type Listener = (evt: NFCEvent) => boolean; // return true if consumed

const listeners = new Set<Listener>();
let installed = false;

function installDispatcher() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as any;
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
        try { prev(evt); } catch {}
      }
    }
  };
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
  return { ok: false, error: evt.error || 'nfc_error' };
}

export interface DespiaNFCWriteResult {
  ok: boolean;
  dismissed?: boolean;
  error?: string;
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
  return { ok: false, error: evt.error || 'write_error' };
}
