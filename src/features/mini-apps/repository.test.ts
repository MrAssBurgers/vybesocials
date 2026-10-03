import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMiniApps, publishMiniApp, saveMiniAppDraft, unpublishMiniApp } from './repository';
import { MINI_APP_TEMPLATES } from './templates';

const state = vi.hoisted(() => ({ uid: 'alice', rows: new Map<string, Record<string, unknown>>(), sequence: 0 }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.uid } }) }));
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
  limit: (count: number) => ({ count }),
  query: (collection: string, ...constraints: unknown[]) => ({ collection, constraints }),
  getDocs: vi.fn(async () => ({ docs: [] })),
}));

import { getDocs, setDoc, updateDoc } from 'firebase/firestore';

beforeEach(() => { state.uid = 'alice'; state.rows.clear(); state.sequence = 0; vi.clearAllMocks(); });

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
    state.uid = 'bob';
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
});
