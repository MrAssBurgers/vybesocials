import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMiniAppDraft, getPublishedMiniApp, listMiniAppsPage, MINI_APP_READ_TIMEOUT_MS, publishMiniApp, saveMiniAppDraft, unpublishMiniApp } from './repository';
import { MINI_APP_TEMPLATES } from './templates';

const state = vi.hoisted(() => ({ uid: 'alice', rows: new Map<string, Record<string, unknown>>(), sequence: 0, auth: null as any, listener: null as any, loseAck: false, transactionRead: vi.fn(), transactionWrite: vi.fn() }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: () => ({}) }));
vi.mock('firebase/firestore', () => ({
  runTransaction: vi.fn(async (_db, run) => { const result = await run({ get: state.transactionRead, set: state.transactionWrite, delete: (ref: { path: string }) => state.rows.delete(ref.path) }); if (state.loseAck) { state.loseAck = false; throw new Error('Response lost'); } return result; }),
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

beforeEach(() => { vi.mocked(invokeFunction).mockImplementation(async (_name, body: any) => {
  if (_name === 'deleteMiniAppDraft') {
    const path = `mini_app_drafts/${body.appId}`;
    const markerPath = `_mini_app_draft_identities/${body.appId}`;
    const old = state.rows.get(path);
    const source = old && Object.fromEntries(['title', 'description', 'category', 'html', 'css', 'javascript'].map(key => [key, old[key]]));
    if (JSON.stringify(source ?? state.rows.get(markerPath)?.source) !== JSON.stringify(body.expectedSource)) return { data: null, error: { name: 'aborted', message: 'Draft changed' } } as any;
    state.rows.set(markerPath, { source: body.expectedSource });
    state.rows.delete(path);
    if (state.loseAck) { state.loseAck = false; throw new Error('Response lost'); }
    return { data: { appId: body.appId, deleted: true }, error: null } as any;
  }
  if (_name === 'saveMiniAppDraft') {
    const path = `mini_app_drafts/${body.appId}`;
    const old = state.rows.get(path);
    const pick = (row: any) => Object.fromEntries(['title', 'description', 'category', 'html', 'css', 'javascript'].map(key => [key, row[key]]));
    if (old && old.owner_id !== body.expectedOwnerUid) return { data: null, error: { name: 'permission-denied', message: 'Not your draft' } } as any;
    const same = old && JSON.stringify(pick(old)) === JSON.stringify(body.source);
    if (!same && (old ? !body.expectedSource || JSON.stringify(pick(old)) !== JSON.stringify(body.expectedSource) : !!body.expectedSource)) return { data: null, error: { name: 'aborted', message: 'Draft changed' } } as any;
    const time = { seconds: 1000 + state.sequence, nanoseconds: 0 };
    const row = same ? old : { ...body.source, owner_id: body.expectedOwnerUid, schema_version: 1, created_at: old?.created_at ?? time, updated_at: time };
    state.rows.set(path, structuredClone(row));
    if (state.loseAck) { state.loseAck = false; throw new Error('Response lost'); }
    return { data: { appId: body.appId, source: body.source, createdAt: row.created_at, updatedAt: row.updated_at }, error: null } as any;
  }
 const path = `mini_apps/${body.appId}`; const old = state.rows.get(path); state.rows.set(path, { ...body.source, owner_id: body.expectedOwnerUid, schema_version: 1, status: 'published', publication_revision: 'a'.repeat(32), created_at: old?.created_at ?? { seconds: 1000, nanoseconds: 0 } }); return { data: { appId: body.appId, status: 'published', publicationRevision: 'a'.repeat(32) }, error: null } as any; }); state.uid = 'alice'; state.rows.clear(); state.sequence = 0; state.loseAck = false; vi.clearAllMocks(); state.transactionRead.mockImplementation(async (ref: any) => ({ id: ref.id, exists: () => state.rows.has(ref.path), data: () => structuredClone(state.rows.get(ref.path)) })); state.transactionWrite.mockImplementation((ref: any, data: any) => state.rows.set(ref.path, structuredClone(data))); state.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (listener: unknown) => { state.listener = listener; return () => {}; } }; });
function switchAccount(uid: string) { state.uid = uid; state.auth.currentUser = { uid }; state.listener?.({ uid }); }

describe('mini app private drafts and public snapshots', () => {
  const source = MINI_APP_TEMPLATES[0].source;
  it('releases a stalled library read and allows a fresh retry', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: any) => void;
      vi.mocked(getDocs).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const pending = expect(listMiniAppsPage('alice', 'drafts')).rejects.toThrow('taking too long');
      await vi.advanceTimersByTimeAsync(MINI_APP_READ_TIMEOUT_MS);
      await pending;
      expect(await listMiniAppsPage('alice', 'drafts')).toEqual({ apps: [], nextCursor: null });
      finish({ docs: [] });
      await Promise.resolve();
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('times out a stalled detail read without requiring an app restart', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getDoc).mockImplementationOnce(() => new Promise(() => {}));
      const pending = expect(getPublishedMiniApp('stalled', 'alice')).rejects.toThrow('Check your connection');
      await vi.advanceTimersByTimeAsync(MINI_APP_READ_TIMEOUT_MS);
      await pending;
      expect(await getPublishedMiniApp('missing', 'alice')).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it.each([
    { schema_version: 2 }, { owner_id: null }, { owner_id: '' }, { status: 'draft' },
    { title: {} }, { html: null }, { javascript: 'x'.repeat(100001) },
    { category: 'unknown' }, { publication_revision: 42 },
  ])('does not admit malformed published source through a direct link: %j', async patch => {
    state.rows.set('mini_apps/direct', { ...source, owner_id: 'bob', schema_version: 1, status: 'published', ...patch });
    expect(await getPublishedMiniApp('direct', 'alice')).toBeNull();
  });
  it('projects validated public source without arbitrary stored metadata', async () => {
    state.rows.set('mini_apps/direct', { ...source, owner_id: 'bob', schema_version: 1, status: 'published', id: 'spoofed', private_notes: 'not part of the public app model' });
    const result = await getPublishedMiniApp('direct', 'alice');
    expect(result).toMatchObject({ ...source, id: 'direct', owner_id: 'bob', status: 'published' });
    expect(result).not.toHaveProperty('private_notes');
  });
  it('rejects direct reads before dispatch or after the viewer session changes', async () => {
    await expect(getPublishedMiniApp('direct', 'bob')).rejects.toMatchObject({ code: 'account-changed' });
    expect(getDoc).not.toHaveBeenCalled();
    vi.mocked(getDoc).mockImplementationOnce(async () => {
      switchAccount('bob'); switchAccount('alice');
      return { exists: () => true, data: () => ({ ...source, owner_id: 'alice', schema_version: 1, status: 'published' }) } as any;
    });
    await expect(getPublishedMiniApp('direct', 'alice')).rejects.toMatchObject({ code: 'account-changed' });
  });
  it('publishes a new app when the snapshot read is denied', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    vi.mocked(getDoc).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { apps: [], nextCursor: null }, error: null });
    await publishMiniApp('alice', draft);
    expect(invokeFunction).toHaveBeenCalledWith('listMiniApps', { expectedOwnerUid: 'alice', view: 'published', appId: draft.id }, expect.anything());
    expect(invokeFunction).toHaveBeenLastCalledWith('publishMiniApp', expect.objectContaining({ appId: draft.id, expectedVersion: null, source }));
  });
  it('a timed-out publication preflight cannot publish when its late read completes', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    const intent = { requestId: 'preflight-retry-request' };
    vi.useFakeTimers();
    try {
      let finish!: (value: any) => void;
      vi.mocked(getDoc).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const pending = expect(publishMiniApp('alice', draft, intent)).rejects.toThrow('taking too long');
      await vi.advanceTimersByTimeAsync(MINI_APP_READ_TIMEOUT_MS);
      await pending;
      finish({ exists: () => false });
      await Promise.resolve();
      expect(vi.mocked(invokeFunction).mock.calls.filter(call => call[0] === 'publishMiniApp')).toHaveLength(0);
      await publishMiniApp('alice', draft, intent);
      expect(vi.mocked(invokeFunction).mock.calls.filter(call => call[0] === 'publishMiniApp')).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
  it('deletes only the reviewed private draft and allows an acknowledged-equivalent retry', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    const published = structuredClone(state.rows.get(`mini_apps/${draft.id}`));
    state.loseAck = true;
    await expect(deleteMiniAppDraft('alice', draft)).rejects.toThrow('Response lost');
    await deleteMiniAppDraft('alice', draft);
    expect(state.rows.has(`mini_app_drafts/${draft.id}`)).toBe(false);
    expect(state.rows.get(`mini_apps/${draft.id}`)).toEqual(published);
  });
  it('keeps newer draft source and rejects foreign ownership', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await saveMiniAppDraft('alice', { ...source, title: 'Newer edit' }, draft);
    await expect(deleteMiniAppDraft('alice', draft)).rejects.toMatchObject({ code: 'mini-app-draft-conflict' });
    expect(state.rows.get(`mini_app_drafts/${draft.id}`)?.title).toBe('Newer edit');
    await expect(deleteMiniAppDraft('alice', { ...draft, owner_id: 'bob' })).rejects.toThrow('own drafts');
  });
  it('does not confirm deletion after an account change during the request', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    vi.mocked(invokeFunction).mockImplementationOnce(async () => { switchAccount('bob'); return { data: { appId: draft.id, deleted: true }, error: null }; });
    await expect(deleteMiniAppDraft('alice', draft)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.transactionRead).not.toHaveBeenCalled();
  });
  it.each(['wrong-id', 'not-deleted', 'extra-field', 'null'])('rejects a %s deletion receipt', async mode => {
    const draft = await saveMiniAppDraft('alice', source);
    const receipt: any = { appId: draft.id, deleted: true };
    if (mode === 'wrong-id') receipt.appId = 'another';
    if (mode === 'not-deleted') receipt.deleted = false;
    if (mode === 'extra-field') receipt.extra = true;
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: mode === 'null' ? null : receipt, error: null });
    await expect(deleteMiniAppDraft('alice', draft)).rejects.toThrow('could not be confirmed');
    expect(invokeFunction).toHaveBeenLastCalledWith('deleteMiniAppDraft', { expectedOwnerUid: 'alice', appId: draft.id, expectedSource: source });
    expect(state.transactionRead).not.toHaveBeenCalled();
  });
  it('sends reviewed source to the checked callable without direct writes', async () => {
    const saved = await saveMiniAppDraft('alice', source, null, 'stable-draft');
    await saveMiniAppDraft('alice', { ...source, title: 'Edited' }, saved);
    expect(invokeFunction).toHaveBeenLastCalledWith('saveMiniAppDraft', { expectedOwnerUid: 'alice', appId: 'stable-draft', source: { ...source, title: 'Edited' }, expectedSource: source });
    expect(state.transactionWrite).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });
  it.each(['wrong-id', 'different-source', 'extra-field', 'bad-time', 'reversed-time'])('rejects a %s save receipt', async mode => {
    const time = { seconds: 100, nanoseconds: 0 };
    const receipt: any = { appId: 'stable-draft', source, createdAt: time, updatedAt: time };
    if (mode === 'wrong-id') receipt.appId = 'another';
    if (mode === 'different-source') receipt.source = { ...source, title: 'Wrong content' };
    if (mode === 'extra-field') receipt.ownerUid = 'foreign';
    if (mode === 'bad-time') receipt.updatedAt = { seconds: 100, nanoseconds: 1e9 };
    if (mode === 'reversed-time') receipt.createdAt = { seconds: 101, nanoseconds: 0 };
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: receipt, error: null });
    await expect(saveMiniAppDraft('alice', source, null, 'stable-draft')).rejects.toThrow('could not be confirmed');
  });
  it('preserves callable quota messages and error names', async () => {
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: null, error: { name: 'resource-exhausted', message: 'Your library has 200 saved drafts. [429]' } });
    await expect(saveMiniAppDraft('alice', source, null, 'stable-draft')).rejects.toMatchObject({ code: 'resource-exhausted', message: 'Your library has 200 saved drafts.' });
  });
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
    expect(vi.mocked(invokeFunction).mock.calls.filter(call => call[0] === 'publishMiniApp')).toHaveLength(1);
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
  it('cannot unpublish a newer snapshot from a stale confirmation', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    const opened = { ...state.rows.get(`mini_apps/${draft.id}`), id: draft.id } as any;
    state.rows.set(`mini_apps/${draft.id}`, { ...opened, publication_revision: 'b'.repeat(32) });
    await expect(unpublishMiniApp('alice', opened)).rejects.toMatchObject({ code: 'mini-app-publication-conflict' });
    expect(state.rows.get(`mini_apps/${draft.id}`)?.publication_revision).toBe('b'.repeat(32));
  });
  it('retries an acknowledged-lost unpublish without removing a republished app', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    const opened = { ...state.rows.get(`mini_apps/${draft.id}`), id: draft.id } as any;
    state.loseAck = true;
    await expect(unpublishMiniApp('alice', opened)).rejects.toThrow('Response lost');
    await unpublishMiniApp('alice', opened);
    state.rows.set(`mini_apps/${draft.id}`, { ...opened, publication_revision: 'b'.repeat(32) });
    await expect(unpublishMiniApp('alice', opened)).rejects.toMatchObject({ code: 'mini-app-publication-conflict' });
  });
  it('preserves legacy snapshots unless the displayed timestamp still matches', async () => {
    const opened = { ...source, id: 'legacy', owner_id: 'alice', schema_version: 1 as const, updated_at: { seconds: 1000, nanoseconds: 1 } };
    state.rows.set('mini_apps/legacy', { ...opened, updated_at: { seconds: 1000, nanoseconds: 2 } });
    await expect(unpublishMiniApp('alice', opened)).rejects.toMatchObject({ code: 'mini-app-publication-conflict' });
    state.rows.set('mini_apps/legacy', opened);
    await unpublishMiniApp('alice', opened);
    expect(state.rows.has('mini_apps/legacy')).toBe(false);
  });
  it('unpublishing preserves the private draft', async () => {
    const draft = await saveMiniAppDraft('alice', source);
    await publishMiniApp('alice', draft);
    await unpublishMiniApp('alice', { ...state.rows.get(`mini_apps/${draft.id}`), id: draft.id } as any);
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
    expect(state.transactionWrite).not.toHaveBeenCalled();
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
    expect(state.transactionWrite).not.toHaveBeenCalled();
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
  it('cannot accept a save response under a new account session', async () => {
    vi.mocked(invokeFunction).mockImplementationOnce(async () => { switchAccount('bob'); return { data: {}, error: null } as any; });
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
  it('loads Discover through the checked callable when rules deny the gallery query', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { apps: [{ ...source, id: 'app-1', owner_id: 'bob', schema_version: 1, status: 'published' }], nextCursor: null }, error: null } as any);
    const page = await listMiniAppsPage('alice', 'published');
    expect(page.apps).toEqual([expect.objectContaining({ id: 'app-1', owner_id: 'bob', title: source.title, status: 'published' })]);
    expect(invokeFunction).toHaveBeenCalledWith('listMiniApps', { expectedOwnerUid: 'alice', view: 'published', cursor: null }, expect.objectContaining({ expectedOwnerUid: 'alice' }));
  });
  it('shows an empty draft library when the owner has no saved drafts', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'failed-precondition' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { apps: [], nextCursor: null }, error: null } as any);
    await expect(listMiniAppsPage('alice', 'drafts')).resolves.toEqual({ apps: [], nextCursor: null });
  });
  it('does not treat a missing list function as an empty library', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: null, error: { name: 'not-found', message: 'NOT_FOUND' } } as any);
    await expect(listMiniAppsPage('alice', 'drafts')).rejects.toMatchObject({ code: 'not-found' });
  });
  it('drops another account draft and a poisoned published row from the checked response', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { apps: [
      { ...source, id: 'secret', owner_id: 'bob', schema_version: 1 },
      { ...source, id: 'app-1', owner_id: 'bob', schema_version: 1, status: 'published', private_notes: 'nope' },
    ], nextCursor: null }, error: null } as any);
    const page = await listMiniAppsPage('alice', 'drafts');
    expect(page.apps).toEqual([]);
  });
  it('opens a published app through the checked callable when the direct read is denied', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    vi.mocked(invokeFunction).mockResolvedValueOnce({ data: { apps: [{ ...source, id: 'app-1', owner_id: 'bob', schema_version: 1, status: 'published' }], nextCursor: null }, error: null } as any);
    await expect(getPublishedMiniApp('app-1', 'alice')).resolves.toMatchObject({ id: 'app-1', owner_id: 'bob' });
    expect(invokeFunction).toHaveBeenCalledWith('listMiniApps', { expectedOwnerUid: 'alice', view: 'published', appId: 'app-1' }, expect.anything());
  });

});
