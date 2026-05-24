/**
 * Despia native WebSocket bridge — a `WebSocket`-compatible shim that owns
 * its connection in the native runtime (durable across WebView reloads,
 * backgrounding, and short network drops).
 *
 * Plug into Supabase Realtime via `createClient(..., { realtime: { transport: DespiaWebSocket }})`
 * when `isDespiaRuntime()` is true. Falls back to standard browser WebSocket
 * otherwise (Supabase passes the raw class through — see runtime-client.ts).
 *
 * Acknowledgement strategy: in-memory `Set<message_id>` per connection,
 * sufficient for a single-page session per Despia docs.
 */

import { despiaCall, isDespiaRuntime } from './despiaBridge';

interface WSEvent {
  id: string;
  type:
    | 'connecting'
    | 'open'
    | 'message'
    | 'reconnecting'
    | 'closed'
    | 'error'
    | 'response'
    | 'dropped'
    | 'send_failed';
  ts?: number;
  message_id?: string;
  dataType?: 'json' | 'text' | 'binary';
  payload?: unknown;
  attempt?: number;
  delay?: number;
  protocol?: string;
  code?: number;
  reason?: string;
  clean?: boolean;
  error?: string;
  rid?: string;
  oid?: string;
  count?: number;
}

// Global multiplexer — Despia gives us a single window.onWebSocketEvent
const sockets = new Map<string, DespiaWebSocket>();
let installed = false;

function installDispatcher() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const w = window as any;
  const prev = w.onWebSocketEvent;
  w.onWebSocketEvent = (evt: WSEvent): unknown => {
    try {
      const sock = sockets.get(evt.id);
      if (sock) return sock._dispatch(evt);
    } catch (err) {
      console.warn('[despiaWebSocket] dispatch error', err);
    } finally {
      if (typeof prev === 'function') {
        try { prev(evt); } catch {}
      }
    }
    return true;
  };
}

let idCounter = 0;
function nextId(): string {
  return `vybe-ws-${Date.now()}-${++idCounter}`;
}

type ReadyState = 0 | 1 | 2 | 3; // CONNECTING | OPEN | CLOSING | CLOSED

export class DespiaWebSocket implements WebSocket {
  static readonly CONNECTING = 0 as const;
  static readonly OPEN = 1 as const;
  static readonly CLOSING = 2 as const;
  static readonly CLOSED = 3 as const;
  readonly CONNECTING = 0 as const;
  readonly OPEN = 1 as const;
  readonly CLOSING = 2 as const;
  readonly CLOSED = 3 as const;

  url: string;
  protocol = '';
  extensions = '';
  binaryType: BinaryType = 'blob';
  bufferedAmount = 0;
  readyState: ReadyState = 0;

  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;

  private _id: string;
  private _seenMessages = new Set<string>();
  private _listeners: Record<string, Set<(evt: any) => void>> = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = String(url);
    this._id = nextId();
    installDispatcher();
    sockets.set(this._id, this);

    const params: string[] = [
      `id=${encodeURIComponent(this._id)}`,
      `url=${encodeURIComponent(this.url)}`,
    ];
    if (protocols) {
      const list = Array.isArray(protocols) ? protocols.join(',') : protocols;
      params.push(`protocols=${encodeURIComponent(list)}`);
    }
    // reconnect defaults true on the native side
    void despiaCall(`websocket://connect?${params.join('&')}`);
  }

  addEventListener(type: string, listener: (evt: any) => void): void {
    (this._listeners[type] ||= new Set()).add(listener);
  }
  removeEventListener(type: string, listener: (evt: any) => void): void {
    this._listeners[type]?.delete(listener);
  }
  dispatchEvent(_evt: Event): boolean { return true; }

  private _emit(type: string, evt: any) {
    const handler = (this as any)[`on${type}`];
    if (typeof handler === 'function') {
      try { handler.call(this, evt); } catch (err) { console.warn('[despiaWebSocket] handler', err); }
    }
    for (const l of Array.from(this._listeners[type] || [])) {
      try { l(evt); } catch (err) { console.warn('[despiaWebSocket] listener', err); }
    }
  }

  /** Internal: called by the global dispatcher with the parsed event. */
  _dispatch(evt: WSEvent): unknown {
    switch (evt.type) {
      case 'open': {
        this.readyState = 1;
        this.protocol = evt.protocol || '';
        this._emit('open', new Event('open'));
        return true;
      }
      case 'message': {
        if (evt.message_id && this._seenMessages.has(evt.message_id)) {
          // Already processed — ack so Despia drops it.
          return true;
        }
        if (evt.message_id) this._seenMessages.add(evt.message_id);
        // Normalize to what Supabase Realtime expects: a string for text/json, ArrayBuffer for binary.
        let data: any = evt.payload;
        if (evt.dataType === 'json' && typeof data !== 'string') {
          data = JSON.stringify(data);
        } else if (evt.dataType === 'binary' && typeof data === 'string') {
          try {
            const bin = atob(data);
            const buf = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
            data = buf.buffer;
          } catch {
            data = '';
          }
        }
        const messageEvent = new MessageEvent('message', { data });
        this._emit('message', messageEvent);
        return true;
      }
      case 'closed': {
        this.readyState = 3;
        const ce = new CloseEvent('close', {
          code: evt.code ?? 1006,
          reason: evt.reason || '',
          wasClean: !!evt.clean,
        });
        this._emit('close', ce);
        sockets.delete(this._id);
        return true;
      }
      case 'error': {
        this._emit('error', new Event('error'));
        // Don't delete — `closed` follows.
        return true;
      }
      case 'reconnecting': {
        // Surface as a transient error event so consumers can show a banner if they care.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vybe:realtime-reconnecting', {
            detail: { id: this._id, attempt: evt.attempt, delay: evt.delay },
          }));
        }
        return true;
      }
      case 'dropped': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('vybe:realtime-resync', {
            detail: { id: this._id, count: evt.count },
          }));
        }
        return true;
      }
      case 'send_failed': {
        console.warn('[despiaWebSocket] outbound send permanently failed', evt.oid);
        return true;
      }
      default:
        return true;
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== 1 && this.readyState !== 0) {
      console.warn('[despiaWebSocket] send on closed socket');
      return;
    }
    let payload: string;
    if (typeof data === 'string') {
      payload = data;
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array((data as ArrayBufferView).buffer);
      let bin = '';
      for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]);
      payload = btoa(bin);
    } else {
      console.warn('[despiaWebSocket] unsupported send type — dropping');
      return;
    }
    void despiaCall(`websocket://send?id=${encodeURIComponent(this._id)}&payload=${encodeURIComponent(payload)}`);
  }

  close(code?: number, _reason?: string): void {
    if (this.readyState === 3 || this.readyState === 2) return;
    this.readyState = 2;
    void despiaCall(`websocket://disconnect?id=${encodeURIComponent(this._id)}`);
    // Native will fire a `closed` event; if not, fall back after a tick.
    setTimeout(() => {
      if (this.readyState !== 3) {
        this.readyState = 3;
        this._emit('close', new CloseEvent('close', { code: code ?? 1000, wasClean: true }));
        sockets.delete(this._id);
      }
    }, 1500);
  }
}

/** Pick the right transport for the current runtime. */
export function pickWebSocketTransport(): typeof WebSocket {
  if (isDespiaRuntime()) {
    return DespiaWebSocket as unknown as typeof WebSocket;
  }
  return WebSocket;
}
