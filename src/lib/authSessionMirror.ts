/** Durable Firebase session recovery for native WebViews. Tokens never enter logs. */
export const AUTH_BACKUP_KEY = 'vybe.auth.user';
export const AUTH_VAULT_KEY = 'vybe_auth_user';
const LOGOUT_KEY = 'vybe.auth.signedOut';
const SIGNED_OUT = JSON.stringify({ version: 1, status: 'signed-out' });
const INITIAL_BUDGET = 700, NATIVE_DEADLINE = 10000;
let logoutIntent = false;
export type AuthRestoreState = 'pending' | 'ready' | 'error';
let restoreState: AuthRestoreState = 'ready';
const listeners = new Set<() => void>();
export const getAuthRestoreState = () => restoreState;
export const subscribeAuthRestoreState = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function state(value: AuthRestoreState) { if (restoreState !== value) { restoreState = value; listeners.forEach(listener => listener()); } }
export const firebaseAuthStorageKey = (apiKey: string, appName = '[DEFAULT]') => `firebase:authUser:${apiKey}:${appName}`;
export const prefersLocalAuthPersistence = (ua: string) => /android|iphone|ipad|ipod|despia|vybeapp|; wv\)|\bwv\b/i.test(ua);
function localStore(): Storage | null { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } }
function sessionStore(): Storage | null { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } }
function get(storage: Pick<Storage, 'getItem'> | null, key: string) { try { return storage?.getItem(key) ?? null; } catch { return null; } }
export function hasAuthLogoutTombstone() { return logoutIntent || get(localStore(), LOGOUT_KEY) === '1'; }
export function allowExplicitAuthSignIn() { logoutIntent = false; try { localStore()?.removeItem(LOGOUT_KEY); } catch { /* unavailable */ } }

/** Only a complete SDK serialization for this Firebase project can be restored. */
export function usableAuthJson(value: string | null, apiKey?: string): string | null {
  if (!value || value.length > 200000) return null;
  try {
    const row = JSON.parse(value);
    if (!row || typeof row !== 'object' || typeof row.uid !== 'string' || !row.uid || row.uid.length > 128
      || typeof row.apiKey !== 'string' || !row.apiKey || (apiKey && row.apiKey !== apiKey)
      || typeof row.emailVerified !== 'boolean' || typeof row.isAnonymous !== 'boolean' || !Array.isArray(row.providerData)
      || !row.stsTokenManager || typeof row.stsTokenManager.refreshToken !== 'string' || !row.stsTokenManager.refreshToken
      || typeof row.stsTokenManager.accessToken !== 'string' || !row.stsTokenManager.accessToken
      || !Number.isFinite(row.stsTokenManager.expirationTime) || row.stsTokenManager.expirationTime <= 0
      || (row.tenantId !== undefined && row.tenantId !== null)) return null;
    return value;
  } catch { return null; }
}
export function seedFirebaseAuthFromBackup(storage: Pick<Storage, 'getItem' | 'setItem'>, apiKey: string): boolean {
  if (get(storage, LOGOUT_KEY) === '1' || !apiKey || usableAuthJson(get(storage, firebaseAuthStorageKey(apiKey)), apiKey)) return false;
  const backup = usableAuthJson(get(storage, AUTH_BACKUP_KEY), apiKey);
  if (!backup) return false;
  try { storage.setItem(firebaseAuthStorageKey(apiKey), backup); return true; } catch { return false; }
}
export function mirrorAuthUserJson(storage: Pick<Storage, 'setItem'> & Partial<Pick<Storage, 'removeItem'>>, apiKey: string, json: string) {
  if (!usableAuthJson(json, apiKey)) return;
  logoutIntent = false;
  // One failing storage write must not prevent the independent native backup.
  try { storage.setItem(firebaseAuthStorageKey(apiKey), json); } catch { /* storage unavailable */ }
  try { storage.setItem(AUTH_BACKUP_KEY, json); } catch { /* storage unavailable */ }
  try { storage.removeItem?.(LOGOUT_KEY); } catch { /* storage unavailable */ }
}

type VaultRead = (key: string, timeoutMs: number) => Promise<string | null>;
type VaultWrite = (key: string, value: string) => void | Promise<void>;
let vaultRead: VaultRead | null = null, vaultWrite: VaultWrite | null = null;
let generation = 0, writeVersion = 0, activeApiKey = '', lastAcknowledged = '';
let desired: { value: string; version: number; guard: () => void } | null = null;
let latestIntent: typeof desired = null;
let writer: Promise<void> | null = null;
let writeRetry: ReturnType<typeof setTimeout> | undefined;
let automaticRetries = 0;
let readQueue: Promise<unknown> = Promise.resolve();
let currentRead: { restore: boolean; controller: AbortController } | null = null;
let nativeOutstanding = false;
let preparePromise: Promise<void> | null = null, prepareDone = true;
export function setAuthVaultTransportForTests(transport: { read: VaultRead; write: VaultWrite } | null) {
  vaultRead = transport?.read ?? null; vaultWrite = transport?.write ?? null; lastAcknowledged = ''; desired = null; latestIntent = null; writer = null; writeVersion++;
}
/** Detect the actual shell, including bridge-only and iPad desktop-mode shells. */
export function nativeAuthVaultAvailable() {
  if (vaultRead || vaultWrite) return true;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '', w = window as Window & { __DESPIA__?: unknown; Despia?: unknown; despiaVersion?: unknown; webkit?: { messageHandlers?: { despia?: unknown } } };
  return /despia|vybeapp|vybehub|com\.despia\.vybe|com\.vybe|app\.lovable\./i.test(ua)
    || !!(w.__DESPIA__ || w.Despia || w.despiaVersion || w.webkit?.messageHandlers?.despia)
    || (/Android/i.test(ua) && /; wv\)|Version\/4\.0.*Chrome/i.test(ua))
    || ((/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) && /AppleWebKit/i.test(ua) && !/Safari/i.test(ua.split('AppleWebKit')[1] || ''));
}
function command(value: string) { (window as unknown as { despia: string }).despia = value; }
function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Native session storage did not respond.')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
/** Clear the callback before dispatch; the SDK's dispatch-then-clear loses synchronous native replies. */
async function performNativeRead(timeoutMs: number, signal: AbortSignal): Promise<string | null> {
  if (vaultRead) return deadline(Promise.race([vaultRead(AUTH_VAULT_KEY, timeoutMs), new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Retired native session read.')), { once: true });
  })]), timeoutMs);
  if (!nativeAuthVaultAvailable()) return null;
  const target = window as unknown as Record<string, unknown>;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    let drainingOldReply = nativeOutstanding;
    const dispatch = () => {
      try { delete target[AUTH_VAULT_KEY]; } catch { target[AUTH_VAULT_KEY] = undefined; }
      nativeOutstanding = true;
      command(`readvault://?key=${AUTH_VAULT_KEY}`);
    };
    const aborted = () => finish(new Error('Retired native session read.'));
    const finish = (error?: Error, value?: string | null) => { if (timer) clearTimeout(timer); signal.removeEventListener('abort', aborted); if (error) reject(error); else resolve(value ?? null); };
    signal.addEventListener('abort', aborted, { once: true });
    const check = () => {
      const raw = target[AUTH_VAULT_KEY];
      if (raw !== undefined && raw !== 'n/a') {
        nativeOutstanding = false;
        if (drainingOldReply) {
          // The protocol has no callback nonce. A retired command's reply is
          // discarded, never relabelled as the new generation's credentials.
          drainingOldReply = false;
          try { dispatch(); } catch { finish(new Error('Native session storage is unavailable.')); return; }
          timer = setTimeout(check, 0); return;
        }
        if (raw === null || raw === '') { finish(undefined, null); return; }
        if (typeof raw !== 'string') { finish(new Error('Saved session is invalid.')); return; }
        try { finish(undefined, decodeURIComponent(raw)); } catch { finish(undefined, raw); } return;
      }
      if (Date.now() - started >= timeoutMs) { finish(new Error('Native session storage did not respond.')); return; }
      timer = setTimeout(check, Math.min(50, timeoutMs - (Date.now() - started)));
    };
    try { if (!drainingOldReply) dispatch(); check(); } catch { finish(new Error('Native session storage is unavailable.')); }
  });
}
// Despia exposes one callback slot per vault key. Reads must never overlap;
// retiring a restore releases its observer before a logout/write verification.
function readNative(timeoutMs: number, restore = false, guard: () => void = () => {}): Promise<string | null> {
  const read = readQueue.then(async () => {
    guard();
    const entry = { restore, controller: new AbortController() }; currentRead = entry;
    try { return await performNativeRead(timeoutMs, entry.controller.signal); }
    finally { if (currentRead === entry) currentRead = null; }
  });
  readQueue = read.catch(() => {});
  return read;
}
async function writeNative(value: string) {
  if (vaultWrite) { await vaultWrite(AUTH_VAULT_KEY, value); return; }
  command(`setvault://?key=${AUTH_VAULT_KEY}&value=${encodeURIComponent(value)}&locked=false`);
}
function drainWrites() {
  if (writer || !desired || !nativeAuthVaultAvailable()) return;
  writer = (async () => {
    for (let attempts = 0; desired && attempts < 3; attempts++) {
      const entry = desired;
      try {
        entry.guard();
        if (entry.value === lastAcknowledged) { if (desired === entry) desired = null; continue; }
        const dispatched = writeNative(entry.value);
        void dispatched.then(() => {
          // A timed-out asynchronous transport can still finish. Reassert the
          // latest login/logout even if its own write was already acknowledged.
          if (entry.version !== writeVersion && latestIntent) {
            try {
              latestIntent.guard(); desired = latestIntent; lastAcknowledged = ''; automaticRetries = 0; drainWrites();
            } catch { /* The newer account has also retired. */ }
          }
        }, () => {});
        await deadline(dispatched, 1200); entry.guard();
        const saved = await readNative(1200); entry.guard();
        if (saved !== entry.value) throw new Error('Session backup was not confirmed.');
        lastAcknowledged = entry.value;
        if (desired === entry) desired = null;
      } catch { /* Keep the latest unconfirmed write eligible for a later retry. */ }
      // A retired write must yield to the newest login/logout intent.
      if (desired === entry) break;
    }
  })().finally(() => {
    writer = null;
    if (desired && automaticRetries++ < 3) {
      clearTimeout(writeRetry);
      writeRetry = setTimeout(drainWrites, 1500);
    }
  });
}
export function retryAuthVaultWrite() { drainWrites(); }
export async function flushAuthVault() { drainWrites(); await writer; return !desired || !nativeAuthVaultAvailable(); }
export function retireAuthRestore() {
  if (currentRead?.restore) currentRead.controller.abort();
  generation++; prepareDone = true; preparePromise = Promise.resolve(); state('ready');
}
export function writeAuthVault(json: string, guard: () => void = () => {}) {
  const value = usableAuthJson(json, activeApiKey || undefined);
  if (!value || !nativeAuthVaultAvailable()) return;
  guard();
  automaticRetries = 0;
  const version = ++writeVersion;
  desired = { value, version, guard: () => { guard(); if (version !== writeVersion) throw new Error('Retired session backup.'); } };
  latestIntent = desired;
  drainWrites();
}
export function clearAuthVault(guard: () => void = () => {}) {
  guard(); retireAuthRestore(); lastAcknowledged = '';
  logoutIntent = true;
  try { localStore()?.setItem(LOGOUT_KEY, '1'); } catch { /* Native tombstone is independent. */ }
  automaticRetries = 0;
  const version = ++writeVersion;
  desired = { value: SIGNED_OUT, version, guard: () => { guard(); if (version !== writeVersion) throw new Error('Retired sign-out backup.'); } };
  latestIntent = desired;
  drainWrites();
}
export function clearMirroredAuth(storage: Pick<Storage, 'getItem' | 'removeItem' | 'key'> & { length: number }, guard: () => void = () => {}) {
  guard(); clearAuthVault(guard);
  try { storage.removeItem(AUTH_BACKUP_KEY); } catch { /* Still clear the vault. */ }
  const keys: string[] = [];
  try { for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith('firebase:authUser:')) keys.push(key); } } catch { /* unavailable storage */ }
  for (const key of keys) { guard(); try { storage.removeItem(key); } catch { /* unavailable storage */ } }
}
export async function readAuthVault(timeoutMs = INITIAL_BUDGET) { try { return usableAuthJson(await readNative(timeoutMs), activeApiKey || undefined); } catch { return null; } }
export const isAuthStorageReady = () => prepareDone;
async function readIndexedDbAuth(apiKey: string, timeoutMs: number): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: string | null) => { if (!settled) { settled = true; clearTimeout(timer); resolve(usableAuthJson(value, apiKey)); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open('firebaseLocalStorageDb'); } catch { finish(null); return; }
    request.onupgradeneeded = () => { try { request.transaction?.abort(); } catch { /* no existing store */ } finish(null); };
    request.onerror = () => finish(null);
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      try {
        const read = database.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').get(firebaseAuthStorageKey(apiKey));
        read.onsuccess = () => { database.close(); const value = read.result?.value; finish(value ? typeof value === 'string' ? value : JSON.stringify(value) : null); };
        read.onerror = () => { database.close(); finish(null); };
      } catch { database.close(); finish(null); }
    };
  });
}
export function resetAuthStoragePrepareForTests() {
  currentRead?.controller.abort(); currentRead = null; readQueue = Promise.resolve();
  nativeOutstanding = false;
  logoutIntent = false;
  clearTimeout(writeRetry); automaticRetries = 0;
  generation++; preparePromise = null; prepareDone = true; state('ready'); activeApiKey = ''; desired = null; latestIntent = null; writer = null; lastAcknowledged = ''; writeVersion++;
}
export function retryAuthStorage(apiKey: string, ua = '') {
  if (currentRead?.restore) currentRead.controller.abort();
  generation++; preparePromise = null; prepareDone = true;
  return ensureAuthStorageReady(apiKey, ua);
}
/** Finish the bounded native read before starting Firebase, so only the SDK hydrates credentials. */
export function ensureAuthStorageReady(apiKey: string, ua = ''): Promise<void> {
  if (preparePromise) return preparePromise;
  activeApiKey = apiKey;
  const storage = localStore();
  if (hasAuthLogoutTombstone()) { state('ready'); prepareDone = true; preparePromise = Promise.resolve(); return preparePromise; }
  if (storage) seedFirebaseAuthFromBackup(storage, apiKey);
  const key = firebaseAuthStorageKey(apiKey);
  if (!apiKey || usableAuthJson(get(storage, key), apiKey) || usableAuthJson(get(sessionStore(), key), apiKey)) { state('ready'); preparePromise = Promise.resolve(); return preparePromise; }
  const native = nativeAuthVaultAvailable(), mobile = native || prefersLocalAuthPersistence(ua);
  if (!mobile) { state('ready'); preparePromise = Promise.resolve(); return preparePromise; }
  const attempt = ++generation;
  const guard = () => { if (attempt !== generation) throw new Error('Retired saved-session recovery.'); };
  state('pending'); prepareDone = false;
  const work = (async () => {
    // True only after a complete saved account was recovered. A vault that
    // never answers, or an empty/unreadable backup, is not that account.
    let preservedSession = false;
    try {
      let json: string | null = null;
      if (native) {
        const value = await readNative(NATIVE_DEADLINE, true, guard); guard();
        if (value === SIGNED_OUT) { logoutIntent = true; try { storage?.setItem(LOGOUT_KEY, '1'); } catch { /* unavailable */ } state('ready'); return; }
        if (value) { json = usableAuthJson(value, apiKey); if (!json) throw new Error('Saved session does not match this app.'); }
      }
      if (!json) json = await readIndexedDbAuth(apiKey, 350);
      guard();
      if (json) {
        preservedSession = true;
        if (storage) mirrorAuthUserJson(storage, apiKey, json);
        if (get(storage, key) !== json) {
          const fallback = sessionStore();
          try { fallback?.setItem(key, json); } catch { /* Verify the independent SDK fallback below. */ }
          if (get(fallback, key) !== json) throw new Error('Saved session storage is unavailable.');
        }
      }
      state('ready');
    } catch { if (attempt === generation) state(preservedSession ? 'error' : 'ready'); }
  })();
  preparePromise = work.finally(() => { if (attempt === generation) prepareDone = restoreState === 'ready'; listeners.forEach(listener => listener()); });
  return preparePromise;
}
