import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMiniAppsPage, publishMiniApp, saveMiniAppDraft, unpublishMiniApp } from './repository';
import { MINI_APP_TEMPLATES } from './templates';

const state = vi.hoisted(() => ({ uid: 'alice', rows: new Map<string, Record<string, unknown>>(), sequence: 0, auth: null as any, listener: null as any, loseAck: false, transactionRead: vi.fn(), transactionWrite: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn(async (_db, run) => { const result = await run({ get: state.transactionRead, set: state.transactionWrite }); if (state.loseAck) { state.loseAck = false; throw new Error('Response lost'); } return result; }),
  collection: (_db: unknown, name: string) => name,
  doc: (first: unknown, collection?: string, id?: string) => id ? { path: `${collection}/${id}`, id } : { path: `${first}/app-${++state.sequence}`, id: `app-${state.sequence}` },
  serverTimestamp: () => ({ seconds: 1000 + state.sequence, nanoseconds: 0 }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => { state.rows.set(ref.path, structuredClone(data)); }),
  updateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => { state.rows.set(ref.path, { ...state.rows.get(ref.path), ...structuredClone(data) }); }),
  getDoc: vi.fn(async (ref: { path: string }) => ({ exists: () => state.rows.has(ref.path), data: () => structuredClone(state.rows.get(ref.path)) })),
  deleteDoc: vi.fn(async (ref: { path: string }) => { state.rows.delete(ref.path); }),
  where: (field: string, op: string, value: string) => ({ field, op, value }),
  documentId: () => '__name__',
  orderBy: (field: string) => ({ order: field }),
  startAfter: (id: string) => ({ after: id }),
  limit: (count: number) => ({ count }),
  query: (collection: string, ...constraints: unknown[]) => ({ collection, constraints }),
  getDocs: vi.fn(async (q: { collection: string; constraints: Array<{ field?: string; op?: string; value?: string; count?: number; after?: string }> }) => ({ docs: [...state.rows].filter(([path, data]) => path.startsWith(`${q.collection}/`) && q.constraints.every(c => {
    if (c.after) return path.split('/')[1] > c.after;
    if (!c.field) return true;
    const value = c.field === '__name__' ? path.split('/')[1] : data[c.field];
    return c.op === '>=' ? String(value) >= c.value! : value === c.value;
  })).sort(([a], [b]) => a.localeCompare(b)).slice(0, q.constraints.find(c => c.count)?.count).map(([path, data]) => ({ id: path.split('/')[1], data: () => structuredClone(data) })) })),
}));

import { invokeFunction } from '@/lib/firebase/functionsService';
import { getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

beforeEach(() => { vi.mocked(invokeFunction).mockImplementation(async (_name, body: any) => { const path = `mini_apps/${body.appId}`; const old = state.rows.get(path); state.rows.set(path, { ...body.source, owner_id: body.expectedOwnerUid, schema_version: 1, status: 'published', publication_revision: 'a'.repeat(32), created_at: old?.created_at ?? { seconds: 1000, nanoseconds: 0 } }); return { data: { appId: body.appId, status: 'published', publicationRevision: 'a'.repeat(32) }, error: null } as any; }); state.uid = 'alice'; state.rows.clear(); state.sequence = 0; state.loseAck = false; vi.clearAllMocks(); state.transactionRead.mockImplementation(async (ref: any) => ({ id: ref.id, exists: () => state.rows.has(ref.path), data: () => structuredClone(state.rows.get(ref.path)) })); state.transactionWrite.mockImplementation((ref: any, data: any) => state.rows.set(ref.path, structuredClone(data))); state.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (listener: unknown) => { state.listener = listener; return () => {}; } }; });
function switchAccount(uid: string) { state.uid = uid; state.auth.currentUser = { uid }; state.listener?.({ uid }); }

describe('mini app private drafts and public snapshots', () => {
  const source = MINI_APP_TEMPLATES[0].source;
  it('retains the original version and request identity after a lost publication response', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    const intent = { requestId: 'stable-publication-request' };
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: null, error: { code: 'unavailable', message: 'Response lost' } } as any);
    await expect(publishMiniApp('alice', draft, intent)).rejects.toThrow('Response lost');
    const first = structuredClone(vi.mocked(invokeFunction).mock.calls.at(-1));
    state.rows.set(`mini_apps/${draft.id}`, { publication_revision: 'b'.repeat(32) });
    await publishMiniApp('alice', draft, intent);
    expect(vi.mocked(invokeFunction).mock.calls.at(-1)).toEqual(first);
    expect(getDoc).toHaveBeenCalledTimes(1);
  });
  it('does not reuse a failed intent for changed code', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    const intent = { requestId: 'stable-publication-request' };
    await publishMiniApp('alice', draft, intent);
    await expect(publishMiniApp('alice', { ...draft, title: 'Different source' }, intent)).rejects.toThrow('Your code changed');
    expect(invokeFunction).toHaveBeenCalledTimes(1);
  });
  it('does not confirm a malformed publication receipt', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { appId: 'another-app', status: 'published', publicationRevision: 'a'.repeat(32) }, error: null } as any);
    await expect(publishMiniApp('alice', draft)).rejects.toThrow('could not be confirmed');
  });
  it('does not report success after an account change during publishing', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    vi.mocked(invokeFunction).mockImplementationOnce(async () => { switchAccount('bob'); return { data: {}, error: null } as any; });
    await expect(publishMiniApp('alice', draft)).rejects.toMatchObject({ code: 'account-changed' });
  });
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
    await listMiniAppsPage('alice', 'published');
    expect(getDocs).toHaveBeenLastCalledWith({ collection: 'mini_apps', constraints: [{ field: 'status', op: '==', value: 'published' }, { order: '__name__' }, { count: 25 }] });
    await listMiniAppsPage('alice', 'drafts');
    expect(getDocs).toHaveBeenLastCalledWith({ collection: 'mini_app_drafts', constraints: [{ field: 'owner_id', op: '==', value: 'alice' }, { order: '__name__' }, { count: 25 }] });
  });
  it('confirms a durable save without a fragile follow-up read', async () => {
    await saveMiniAppDraft('alice', source);
    expect(getDoc).not.toHaveBeenCalled();
  });
  it('recovers a committed new draft by stable identity after its acknowledgement is lost', async () => {
    state.loseAck = true;
    await expect(saveMiniAppDraft('alice', source, null, 'retained-id')).rejects.toThrow('Response lost');
    const created = state.rows.get('mini_app_drafts/retained-id')?.created_at;
    const saved = await saveMiniAppDraft('alice', source, null, 'retained-id');
    expect(saved.id).toBe('retained-id'); expect(state.rows.size).toBe(1);
    expect(saved.created_at).toEqual(created);
    expect(state.transactionWrite).toHaveBeenCalledTimes(1);
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
    expect(state.transactionWrite).toHaveBeenCalledTimes(1);
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
  it('cannot save under a new session after the transactional lookup', async () => {
    state.transactionRead.mockImplementationOnce(async () => { switchAccount('bob'); return { exists: () => false }; });
    await expect(saveMiniAppDraft('alice', source, null, 'retained-id')).rejects.toMatchObject({ code: 'account-changed' });
    expect(setDoc).not.toHaveBeenCalled();
  });
  it('rejects a stale editor without changing the newer draft or published snapshot', async () => {
    const first = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', first);
    await saveMiniAppDraft('alice', { ...source, title: 'Newer remote edit' }, first);
    await expect(saveMiniAppDraft('alice', { ...source, title: 'Stale local edit' }, first)).rejects.toMatchObject({ code: 'mini-app-conflict' });
    expect(state.rows.get(`mini_app_drafts/${first.id}`)?.title).toBe('Newer remote edit');
    expect(state.rows.get(`mini_apps/${first.id}`)?.title).toBe(source.title);
    const copy = await saveMiniAppDraft('alice', { ...source, title: 'Stale local edit' }, null, 'preserved-copy');
    expect(copy.id).toBe('preserved-copy'); expect(state.rows.get('mini_app_drafts/preserved-copy')?.title).toBe('Stale local edit');
  });
  it('does not overwrite a different recovered draft or resurrect a deleted draft', async () => {
    const first = await saveMiniAppDraft('alice', source, null, 'retained-id');
    await expect(saveMiniAppDraft('alice', { ...source, title: 'Different recovered work' }, null, 'retained-id')).rejects.toMatchObject({ code: 'mini-app-conflict' });
    state.rows.delete('mini_app_drafts/retained-id');
    await expect(saveMiniAppDraft('alice', source, first)).rejects.toMatchObject({ code: 'mini-app-conflict' });
    expect(state.rows.size).toBe(0);
  });

  it('continues beyond sixty drafts without duplicates and survives a removed boundary', async () => {
    for (let i = 0; i < 65; i++) state.rows.set(`mini_app_drafts/draft-${String(i).padStart(3, '0')}`, { ...source, owner_id: 'alice', schema_version: 1 });
    const first = await listMiniAppsPage('alice', 'drafts'); expect(first.apps).toHaveLength(24); expect(first.nextCursor).toBe('draft-023');
    state.rows.delete('mini_app_drafts/draft-023');
    const second = await listMiniAppsPage('alice', 'drafts', first.nextCursor!); expect(second.apps).toHaveLength(24);
    const last = await listMiniAppsPage('alice', 'drafts', second.nextCursor!); expect(last.apps).toHaveLength(17); expect(last.nextCursor).toBeNull();
    expect(new Set([...first.apps, ...second.apps, ...last.apps].map(app => app.id)).size).toBe(65);
  });
  it('continues through malformed source and rejects late-account list results', async () => {
    for (let i = 0; i < 25; i++) state.rows.set(`mini_apps/app-${String(i).padStart(3, '0')}`, { ...source, owner_id: 'alice', schema_version: 1, status: 'published', html: 42 });
    const page = await listMiniAppsPage('alice', 'published'); expect(page.apps).toEqual([]); expect(page.nextCursor).toBe('app-023');
    vi.mocked(getDocs).mockImplementationOnce(async () => { switchAccount('bob'); return { docs: [] } as any; });
    await expect(listMiniAppsPage('alice', 'published', page.nextCursor!)).rejects.toMatchObject({ code: 'account-changed' });
  });

});
