import { applicationDefault, getApp } from 'firebase-admin/app';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

export type TokenAuthAccount = Readonly<{ uid: string; createdAtMs: number; validSince: number; disabled: boolean }>;
export type TokenAccountContext = Readonly<{ uid: string; createdAtMs: number; authTime: number }>;
export type TokenAccountLookup = (uid: string) => Promise<TokenAuthAccount>;
const guards = new WeakMap<TokenAccountContext, () => Promise<void>>();
const unavailable = () => new HttpsError('unavailable', 'Your token account could not be checked. Please retry.');
const signedOut = () => new HttpsError('unauthenticated', 'Sign in again with current credentials before using tokens.');
const uidValid = (uid: unknown): uid is string => typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !uid.includes('/');
function integer(value: unknown, zero = false): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,15})$/.test(value)) throw unavailable();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (zero ? 0 : 1)) throw unavailable();
  return parsed;
}

/** Use the documented account lookup, retaining millisecond createdAt. Admin
 * UserMetadata.creationTime is formatted as UTC text with only whole seconds. */
export function createTokenAccountLookup(options: {
  projectId: string; emulatorHost?: string; credential: () => Promise<{ access_token: string }>;
  fetch?: typeof globalThis.fetch; timeoutMs?: number;
}): TokenAccountLookup {
  const demo = /^demo-vybe-[a-z0-9-]+$/.test(options.projectId);
  if (options.emulatorHost ? !demo || !/^127\.0\.0\.1:[1-9]\d{1,4}$/.test(options.emulatorHost) : demo || options.projectId !== 'vybe-daaab') throw unavailable();
  const base = options.emulatorHost ? `http://${options.emulatorHost}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const endpoint = `${base}/v1/projects/${options.projectId}/accounts:lookup`;
  const fetchAccount = options.fetch ?? globalThis.fetch;
  return async uid => {
    if (!uidValid(uid)) throw signedOut();
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const credential = options.emulatorHost ? 'owner' : (await options.credential()).access_token;
          if (!credential || controller.signal.aborted) throw unavailable();
          const response = await fetchAccount(endpoint, { method: 'POST', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ localId: [uid] }) });
          if (!response.ok) throw unavailable();
          const body = await response.json() as { users?: unknown };
          if (body.users === undefined || (Array.isArray(body.users) && body.users.length === 0)) throw signedOut();
          if (!Array.isArray(body.users) || body.users.length !== 1) throw unavailable();
          const row = body.users[0] as Record<string, unknown> | null;
          if (!row || row.localId !== uid || row.tenantId !== undefined || (row.disabled !== undefined && typeof row.disabled !== 'boolean')) throw unavailable();
          return Object.freeze({ uid, createdAtMs: integer(row.createdAt), validSince: row.validSince === undefined ? 0 : integer(row.validSince, true), disabled: row.disabled === true });
        })(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(unavailable()); }, options.timeoutMs ?? 8_000); }),
      ]);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw unavailable();
    } finally { clearTimeout(timer); controller.abort(); }
  };
}

export async function captureTokenAccount(uid: string, claims: Record<string, unknown>, lookup: TokenAccountLookup, now = Date.now): Promise<TokenAccountContext> {
  const authTime = claims.auth_time;
  if (!uidValid(uid) || typeof authTime !== 'number' || !Number.isSafeInteger(authTime) || authTime <= 0
    || (claims.sub !== undefined && claims.sub !== uid)
    || (claims.firebase && typeof claims.firebase === 'object' && 'tenant' in claims.firebase)) throw signedOut();
  const check = (account: TokenAuthAccount, createdAtMs?: number) => {
    if (account.uid !== uid || account.disabled || !Number.isSafeInteger(account.createdAtMs) || account.createdAtMs <= 0
      || !Number.isSafeInteger(account.validSince) || account.validSince < 0) throw signedOut();
    if ((createdAtMs !== undefined && account.createdAtMs !== createdAtMs) || authTime < account.validSince
      || authTime < Math.floor(account.createdAtMs / 1000) || authTime * 1000 > now() + 1000 || account.createdAtMs > now() + 1000) throw signedOut();
  };
  const account = await lookup(uid); check(account);
  const context = Object.freeze({ uid, authTime, createdAtMs: account.createdAtMs });
  guards.set(context, async () => { check(await lookup(uid), context.createdAtMs); });
  return context;
}

export async function assertTokenAccountCurrent(context: TokenAccountContext): Promise<void> {
  const guard = guards.get(context);
  if (!guard) throw signedOut();
  await guard();
}

/** Fresh account admission is rechecked before the transaction callback may
 * commit, including replay and read-only returns. A failure rolls back writes.
 * Unbound internal actors remain for staged legacy writers; they cannot supply
 * a fabricated context. The full ledger-incarnation cutover is separate. */
export async function tokenAccountTransaction<T>(db: Firestore, actor: { authUid: string; account?: TokenAccountContext }, run: (tx: Transaction) => Promise<T>): Promise<T> {
  const account = actor.account;
  if (account && (account.uid !== actor.authUid || !guards.has(account))) throw signedOut();
  return db.runTransaction(async tx => {
    const result = await run(tx);
    if (account) {
      if (actor.authUid !== account.uid) throw signedOut();
      await assertTokenAccountCurrent(account);
    }
    return result;
  });
}

export async function currentTokenAccount(uid: string, claims: Record<string, unknown>): Promise<TokenAccountContext> {
  const app = getApp();
  const lookup = createTokenAccountLookup({ projectId: app.options.projectId || process.env.GCLOUD_PROJECT || '', emulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    credential: () => (app.options.credential ?? applicationDefault()).getAccessToken() });
  return captureTokenAccount(uid, claims, lookup);
}
