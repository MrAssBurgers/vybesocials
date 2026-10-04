import { isLocalPreview, LOCAL_PREVIEW_PORTS, LOCAL_PREVIEW_PROJECT } from './localPreview';

const installedKey = Symbol.for('vybe.localPreview.fetchDiagnostics');
type DiagnosticScope = typeof globalThis & { [installedKey]?: boolean };

function log(message: string) {
  try { console.debug(message); } catch { /* Observing must not affect delivery. */ }
}

function diagnosticEndpoint(input: RequestInfo | URL): string | null {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw);
    const prefix = `/${LOCAL_PREVIEW_PROJECT}/us-central1/`;
    const directEmulator = `http://127.0.0.1:${LOCAL_PREVIEW_PORTS.functions}`;
    if ((url.origin !== directEmulator && url.origin !== location.origin) ||
        !url.pathname.startsWith(prefix) || url.username || url.password ||
        !/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(url.pathname.slice(prefix.length))) return null;
    // Query strings, fragments and all request/response bodies stay private.
    return `${url.origin}${url.pathname}`;
  } catch { return null; }
}

/** Install before React's reporting hooks capture fetch; never patch an SDK instance. */
export function installLocalPreviewFetchDiagnostics() {
  if (!import.meta.env.DEV || import.meta.env.VITE_LOCAL_PREVIEW_DIAGNOSTICS !== 'true' || !isLocalPreview()) return;
  const scope = globalThis as DiagnosticScope;
  if (scope[installedKey] || typeof scope.fetch !== 'function') return;
  const underlyingFetch = scope.fetch;
  let sequence = 0;
  scope.fetch = function observedLocalFetch(input, init) {
    const endpoint = diagnosticEndpoint(input);
    if (!endpoint) return underlyingFetch.call(this, input, init);
    const request = ++sequence;
    log(`[VYBE local fetch] entry request=${request} endpoint=${endpoint}`);
    return (async () => {
      try {
        const response = await underlyingFetch.call(this, input, init);
        log(`[VYBE local fetch] response request=${request} endpoint=${endpoint} status=${response.status}`);
        return response;
      } catch (error) {
        log(`[VYBE local fetch] rejected request=${request} endpoint=${endpoint}`);
        throw error;
      }
    })();
  };
  scope[installedKey] = true;
}
