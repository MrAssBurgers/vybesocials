import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMiniApps, publishMiniApp, saveMiniAppDraft, unpublishMiniApp } from './repository';
import { MINI_APP_TEMPLATES } from './templates';

const state = vi.hoisted(() => ({ uid: 'alice', rows: new Map<string, Record<string, unknown>>(), sequence: 0, auth: null as any, listener: null as any }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => name,
  doc: (first: unknown, collection?: string, id?: string) => id ? { path: `${collection}/${id}`, id } : { path: `${first}/app-${++state.sequence}`, id: `app-${state.sequence}` },
  serverTimestamp: () => ({ seconds: 1000 + state.sequence, nanoseconds: 0 }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => { state.rows.set(ref.path, structuredClone(data)); }),
  updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => { state.rows.set(ref.path, { ...state.rows.get(ref.path), ...structuredClone(data) }); }),
  getDoc: vi.fn(async (ref: { path: string }) => ({ exists: () => state.rows.has(ref.path), data: () => structuredClone(state.rows.get(ref.path)) })),
  deleteDoc: vi.fn(async (ref: { path: string }) => { state.rows.delete(ref.path); }),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  documentId: () => '__name__',
  limit: (count: number) => ({ count }),
  query: (collection: string, ...constraints: unknown[]) => ({ collection, constraints }),
  getDocs: vi.fn(async (q: { collection: string; constraints: Array<{ field?: string; op?: string; value?: string; count?: number }> }) => ({ docs: [...state.rows].filter(([path, data]) => path.startsWith(`${q.collection}/`) && q.constraints.every(c => {
    if (!c.field) return true;
    const value = c.field === '__name__' ? path.split('/')[1] : data[c.field];
    return c.op === '>=' ? String(value) >= c.value! : value === c.value;
  })).sort(([a], [b]) => a.localeCompare(b)).slice(0, q.constraints.find(c => c.count)?.count).map(([path, data]) => ({ id: path.split('/')[1], data: () => structuredClone(data) })) })),
}));

import { getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

beforeEach(() => { state.uid = 'alice'; state.rows.clear(); state.sequence = 0; vi.clearAllMocks(); state.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (listener: unknown) => { state.listener = listener; return () => {}; } }; });
function switchAccount(uid: string) { state.uid = uid; state.auth.currentUser = { uid }; state.listener?.({ uid }); }

describe('mini app private drafts and public snapshots', () => {
  const source = MINI_APP_TEMPLATES[0].source;
  it('saves privately and never publishes without a separate call', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    expect(draft.owner_id).toBe('alice');
    expect(state.rows.size).toBe(1);
    expect(state.rows.has(`mini_app_drafts/${draft.id}`)).toBe(true);
    expect(state.rows.has(`mini_apps/${draft.id}`)).toBe(false);
  });
  it('editing a draft cannot modify the published snapshot', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    const original = structuredClone(state.rows.get(`mini_apps/${draft.id}`));
    const edited = await saveMiniAppDraft('alice', { ...source, title: 'Updated privately' }, draft);
    expect(state.rows.get(`mini_apps/${draft.id}`)).toEqual(original);
    expect(state.rows.get(`mini_app_drafts/${draft.id}`)?.title).toBe('Updated privately');
    await publishMiniApp('alice', edited);
    expect(state.rows.get(`mini_apps/${draft.id}`)?.title).toBe('Updated privately');
    expect(state.rows.get(`mini_apps/${draft.id}`)?.created_at).toEqual(original?.created_at);
  });
  it('unpublishing preserves the private draft', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    await unpublishMiniApp('alice', draft);
    expect(state.rows.has(`mini_apps/${draft.id}`)).toBe(false);
    expect(state.rows.has(`mini_app_drafts/${draft.id}`)).toBe(true);
  });
  it('rejects a wrong-account save before any write', async () => {
    await expect(saveMiniAppDraft('bob', source)).rejects.toThrow('Sign in again');
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('rejects editing, publishing, and unpublishing another creator’s app', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    switchAccount('bob');
    await expect(saveMiniAppDraft('bob', source, draft)).rejects.toThrow('own mini apps');
    await expect(publishMiniApp('bob', draft)).rejects.toThrow('own draft');
    await expect(unpublishMiniApp('bob', draft)).rejects.toThrow('own apps');
    expect(updateDoc).not.toHaveBeenCalled();
  });
  it('rejects invalid content before writing', async () => {
    await expect(saveMiniAppDraft('alice', { ...source, title: '' })).rejects.toThrow();
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('uses published-only discovery and owner-only draft queries', async () => {
    await listMiniApps();
    expect(getDocs).toHaveBeenLastCalledWith({ collection: 'mini_apps', constraints: [{ field: 'status', op: '==', value: 'published' }, { count: 60 }] });
    await listMiniApps('alice');
    expect(getDocs).toHaveBeenLastCalledWith({ collection: 'mini_app_drafts', constraints: [{ field: 'owner_id', op: '==', value: 'alice' }, { count: 60 }] });
  });
  it('confirms a durable save without a fragile follow-up read', async () => {
    await saveMiniAppDraft('alice', source);
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('recovers a committed new draft by stable identity after its acknowledgement is lost', async () => {
    vi.mocked(setDoc).mockImplementationOnce(async (ref: any, data: any) => { state.rows.set(ref.path, structuredClone(data)); throw new Error('Response lost'); });
    await expect(saveMiniAppDraft('alice', source, null, 'retained-id')).rejects.toThrow('Response lost');
    const created = state.rows.get('mini_app_drafts/retained-id')?.created_at;
    const saved = await saveMiniAppDraft('alice', { ...source, title: 'Still my draft' }, null, 'retained-id');
    expect(saved.id).toBe('retained-id'); expect(state.rows.size).toBe(1);
    expect(saved.created_at).toEqual(created);
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(getDocs).toHaveBeenLastCalledWith({ collection: 'mini_app_drafts', constraints: [{ field: 'owner_id', op: '==', value: 'alice' }, { field: '__name__', op: '>=', value: 'retained-id' }, { count: 1 }] });
  });
  it('creates the pending draft without copying or updating a neighboring owned draft', async () => {
    const neighbor = { ...source, owner_id: 'alice', created_at: { seconds: 42 }, title: 'Keep this draft' };
    state.rows.set('mini_app_drafts/zz-neighbor', structuredClone(neighbor));
    const saved = await saveMiniAppDraft('alice', source, null, 'pending-id');
    expect(saved.id).toBe('pending-id');
    expect(saved.created_at).not.toEqual(neighbor.created_at);
    expect(state.rows.get('mini_app_drafts/zz-neighbor')).toEqual(neighbor);
    expect(state.rows.get('mini_app_drafts/pending-id')?.title).toBe(source.title);
    expect(updateDoc).not.toHaveBeenCalled();
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
  it.each(['switch', 'aba'])('cannot publish after account %s during the existing snapshot lookup', async mode => {
    const draft = await saveMiniAppDraft('alice', source);
    vi.mocked(getDoc).mockImplementationOnce(async () => {
      switchAccount('bob'); if (mode === 'aba') switchAccount('alice');
      return { exists: () => false } as any;
    });
    vi.mocked(setDoc).mockClear();
    await expect(publishMiniApp('alice', draft)).rejects.toMatchObject({ code: 'account-changed' });
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('cannot save under a new session after the retry lookup', async () => {
    vi.mocked(getDocs).mockImplementationOnce(async () => { switchAccount('bob'); return { docs: [] } as any; });
    await expect(saveMiniAppDraft('alice', source, null, 'retained-id')).rejects.toMatchObject({ code: 'account-changed' });
    expect(setDoc).not.toHaveBeenCalled();
  });
});
