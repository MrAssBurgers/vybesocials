import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ user: {} as object | null, generation: 1, refresh: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { auth: { refreshSession: h.refresh } } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: h.user }), getAuthSessionGeneration: () => h.generation }));
import { refreshFirebaseSession } from './firebaseAuthRefresh';
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { h.user = {}; h.generation++; h.refresh.mockReset(); });
it('shares concurrent refresh only for the exact current session', async () => {
  const d = deferred(); h.refresh.mockReturnValue(d.promise);
  const a = refreshFirebaseSession(), b = refreshFirebaseSession(); expect(a).toBe(b); expect(h.refresh).toHaveBeenCalledTimes(1);
  d.resolve({ data: { session: null }, error: null }); await a;
});
it('does not carry a fatal A error into B or let A completion clear B singleflight', async () => {
  const a = deferred(), b = deferred(); h.refresh.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const old = refreshFirebaseSession(); h.user = {}; h.generation++;
  const fresh = refreshFirebaseSession(); a.resolve({ data: { session: null }, error: { name: 'auth/user-token-expired' } });
  expect((await old).error?.name).toBe('auth/session-changed'); expect(refreshFirebaseSession()).toBe(fresh);
  b.resolve({ data: { session: { user: { id: 'bob' } } }, error: null }); expect((await fresh).data.session?.user.id).toBe('bob');
});
it('A to B to A cannot re-use the original A refresh, even if the SDK object is reused', async () => {
  const a = deferred(), next = deferred(); h.refresh.mockReturnValueOnce(a.promise).mockReturnValueOnce(next.promise);
  const old = refreshFirebaseSession(); h.generation += 2;
  const fresh = refreshFirebaseSession(); expect(fresh).not.toBe(old);
  a.resolve({ data: { session: null }, error: { name: 'auth/user-disabled' } }); expect((await old).error?.name).toBe('auth/session-changed');
  next.resolve({ data: { session: null }, error: null }); await fresh;
});
