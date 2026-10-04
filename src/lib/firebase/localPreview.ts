/** Local QA is explicit, demo-only and never available in a production build. */
export const LOCAL_PREVIEW_PROJECT = 'demo-vybe-preview';
export const LOCAL_PREVIEW_API_KEY = 'demo-vybe-preview-key';
export const LOCAL_PREVIEW_PORTS = { auth: 9199, firestore: 8280, storage: 9399, functions: 5101 } as const;

export function validateLocalPreview(environment: { enabled?: unknown; development: boolean; projectId?: unknown; hostname: string; port: string }) {
  if (environment.enabled === undefined || environment.enabled === '' || environment.enabled === 'false') return false;
  if (environment.enabled !== 'true' || !environment.development || environment.projectId !== LOCAL_PREVIEW_PROJECT || environment.port !== '8082' || !['localhost', '127.0.0.1', '[::1]'].includes(environment.hostname)) {
    throw new Error('Local QA requires a development build on loopback port 8082 with the demo-vybe-preview project.');
  }
  return true;
}

export function isLocalPreview(): boolean {
  return validateLocalPreview({
    enabled: import.meta.env.VITE_FIREBASE_EMULATORS,
    development: import.meta.env.DEV,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    hostname: typeof location === 'undefined' ? '' : location.hostname,
    port: typeof location === 'undefined' ? '' : location.port,
  });
}

/** Refuse a reused origin containing a real login; never migrate or erase it. */
export function assertLocalPreviewStorage(storage: Pick<Storage, 'key' | 'getItem' | 'length'>) {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index) || '';
    if ((key.startsWith('firebase:authUser:') && !key.startsWith(`firebase:authUser:${LOCAL_PREVIEW_API_KEY}:`)) || key.startsWith('sb-')) throw new Error('Local QA requires an origin without a real saved login.');
  }
  const backup = storage.getItem('vybe.auth.user');
  if (backup) {
    let value: unknown;
    try { value = JSON.parse(backup); } catch { throw new Error('Local QA cannot reuse an existing auth backup.'); }
    if (!value || typeof value !== 'object' || !('apiKey' in value) || value.apiKey !== LOCAL_PREVIEW_API_KEY) throw new Error('Local QA cannot reuse an existing auth backup.');
  }
}
