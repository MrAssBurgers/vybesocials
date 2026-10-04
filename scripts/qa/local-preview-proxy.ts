import type { ProxyOptions } from 'vite';

/** Fixed demo callable transport only; never forward an arbitrary path or target. */
export function localPreviewFunctionsProxy(enabled: boolean): Record<string, ProxyOptions> | undefined {
  if (!enabled) return undefined;
  return {
    '^/demo-vybe-preview/us-central1/[A-Za-z][A-Za-z0-9]{0,127}$': {
      target: 'http://127.0.0.1:5101',
      changeOrigin: true,
      followRedirects: false,
      ws: false,
      // Returning false asks Vite to reject the request with 404, without forwarding.
      bypass: request => request.method === 'POST' || request.method === 'OPTIONS' ? undefined : false,
    },
  };
}

/** Firebase's object protocol for this demo bucket only; Rules still authorize it. */
export function localPreviewStorageProxy(enabled: boolean): Record<string, ProxyOptions> | undefined {
  if (!enabled) return undefined;
  return {
    '^/v0/b/demo-vybe-preview\\.appspot\\.com/o(?:/[^/?#]+)?(?:\\?[^#]*)?$': {
      target: 'http://127.0.0.1:9399',
      // The emulator constructs resumable session URLs from Host. Preserve the
      // browser's QA origin so subsequent upload chunks also use this proxy.
      changeOrigin: false,
      followRedirects: false,
      ws: false,
      bypass: request => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method || '') ? undefined : false,
    },
  };
}
