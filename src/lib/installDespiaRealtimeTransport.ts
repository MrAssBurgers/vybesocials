/**
 * Inside Despia, swap the WebSocket constructor for Supabase Realtime URLs
 * with our DespiaWebSocket shim so the connection lives in the native runtime
 * and stays alive across WebView reloads / backgrounding / short network drops.
 *
 * Side-effect import only — run from main.tsx before App mounts.
 */

import { DespiaWebSocket } from './despiaWebSocket';
import { isDespiaRuntime } from './despiaBridge';

const REALTIME_HOST_RE = /\.db\.co\/realtime\/v1\/websocket/i;

let installed = false;

export function installDespiaRealtimeTransport() {
  if (installed || typeof window === 'undefined') return;
  if (!isDespiaRuntime()) return;
  installed = true;

  const Native = window.WebSocket;
  if (!Native) return;

  const Proxy = function (this: any, url: string | URL, protocols?: string | string[]) {
    try {
      const href = typeof url === 'string' ? url : url.toString();
      if (REALTIME_HOST_RE.test(href)) {
        return new (DespiaWebSocket as any)(href, protocols);
      }
    } catch {
      // fall through
    }
    return new (Native as any)(url, protocols);
  } as unknown as typeof WebSocket;

  // Preserve static constants so consumers reading WebSocket.OPEN etc keep working.
  Object.defineProperties(Proxy, {
    CONNECTING: { value: 0 },
    OPEN:       { value: 1 },
    CLOSING:    { value: 2 },
    CLOSED:     { value: 3 },
    prototype:  { value: Native.prototype },
  });

  try {
    (window as any).WebSocket = Proxy;
    console.info('[VYBE] Despia WebSocket transport installed for Realtime');
  } catch (err) {
    console.warn('[VYBE] Could not install Despia WebSocket transport', err);
  }
}
