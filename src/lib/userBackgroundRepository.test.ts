import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeUserBackground, loadUserBackgrounds } from './userBackgroundRepository';

const fake = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(), versions: new Map<string, number>(),
  nextId: 0, rejectCommit: false, retries: 0, remove: vi.fn(), query: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ remove: fake.remove }) } } }));
vi.mock('@/lib/firebase/firestoreDb', () => ({
  documentRef: (table: string, id: string) => `${table}/${id}`, getFirestoreDb: () => ({}),
  newDocumentId: () => `new-${++fake.nextId}`, where: (field: string, op: string, value: unknown) => ({ field, value }),
  getDocumentsFromServer: (table: string, clauses: { field: string; value: unknown }[]) => {
    fake.query(table, clauses);
    return Promise.resolve([...fake.rows.entries()].filter(([key, row]) => key.startsWith(`${table}/`) && clauses.every(c => row[c.field] === c.value)).map(([key, row]) => ({ ...row, id: key.split('/').pop() })));
  },
}));
vi.mock('firebase/firestore', () => ({
  runTransaction: async (_db: unknown, work: (tx: unknown) => Promise<unknown>) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map<string, number>();
      const writes: [string, Record<string, unknown> | null, boolean][] = [];
      const result = await work({
        get: async (path: string) => {
          if (writes.length) throw new Error('Read after write');
          reads.set(path, fake.versions.get(path) ?? 0);
          const row = fake.rows.get(path);
          return { id: path.split('/').pop(), exists: () => !!row, data: () => row ? { ...row } : undefined };
        },
        set: (path: string, row: Record<string, unknown>) => writes.push([path, row, false]),
        update: (path: string, row: Record<string, unknown>) => writes.push([path, row, true]),
        delete: (path: string) => writes.push([path, null, false]),
      });
      if (fake.rejectCommit) throw new Error('Write denied');
      if ([...reads].some(([path, version]) => (fake.versions.get(path) ?? 0) !== version)) { fake.retries++; continue; }
      for (const [path, row, merge] of writes) {
        if (row === null) fake.rows.delete(path);
        else fake.rows.set(path, merge ? { ...fake.rows.get(path), ...row } : row);
        fake.versions.set(path, (fake.versions.get(path) ?? 0) + 1);
      }
      return result;
    }
    throw new Error('Transaction contention');
  },
}));
const actor = { authUid: 'alice-auth', profileId: 'alice-profile' };
const pointer = 'profiles/alice-auth/settings/background';
const check = async () => undefined;
function seed(id: string, active = false, extra = {}) {
  fake.rows.set(`user_backgrounds/${id}`, { user_id: actor.profileId, image_url: `https://example.test/${id}.png`, is_active: active, storage_path: null, created_at: '', ...extra });
}
beforeEach(() => {
  fake.rows.clear(); fake.versions.clear(); fake.nextId = 0; fake.rejectCommit = false; fake.retries = 0;
  vi.clearAllMocks(); fake.remove.mockResolvedValue({ error: null });
});
describe('background persistence', () => {
  it('loads UID and migrated profile libraries without losing imported rows without timestamps', async () => {
    seed('old', true); seed('uid', false, { user_id: actor.authUid, created_at: '2026' }); seed('foreign', false, { user_id: 'bob' });
    expect((await loadUserBackgrounds(actor)).map(row => row.id)).toEqual(['uid', 'old']);
    expect(fake.query.mock.calls.map(call => call[1][0].value)).toEqual(['alice-profile', 'alice-auth']);
  });
  it('cancels an abandoned library query', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(loadUserBackgrounds(actor, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('activates a selected owned image and repairs multiple old active flags atomically', async () => {
    seed('old', true); seed('legacy', true, { user_id: actor.authUid }); seed('chosen');
    await changeUserBackground(actor, { kind: 'activate', id: 'chosen' }, check);
    expect(fake.rows.get('user_backgrounds/old')?.is_active).toBe(false);
    expect(fake.rows.get('user_backgrounds/legacy')?.is_active).toBe(false);
    expect(fake.rows.get('user_backgrounds/chosen')?.is_active).toBe(true);
    expect(fake.rows.get(pointer)?.active_background_id).toBe('chosen');
  });
  it('failed creation leaves the old selection and settings untouched', async () => {
    seed('old', true); fake.rejectCommit = true;
    await expect(changeUserBackground(actor, { kind: 'add', input: { imageUrl: 'https://example.test/new.png' } }, check)).rejects.toThrow('Write denied');
    expect(fake.rows.get('user_backgrounds/old')?.is_active).toBe(true);
    expect(fake.rows.size).toBe(1);
  });
  it('serializes simultaneous new uploads even when both initial queries missed the other upload', async () => {
    seed('old', true);
    await Promise.all([1, 2].map(i => changeUserBackground(actor, { kind: 'add', input: { imageUrl: `https://example.test/${i}.png` } }, check)));
    expect(fake.retries).toBeGreaterThan(0);
    const actives = [...fake.rows].filter(([path, row]) => path.startsWith('user_backgrounds/') && row.is_active);
    expect(actives).toHaveLength(1);
    expect(actives[0][0]).toBe(`user_backgrounds/${fake.rows.get(pointer)?.active_background_id}`);
  });
  it('does not activate an unavailable or foreign image or follow a forged foreign pointer', async () => {
    await expect(changeUserBackground(actor, { kind: 'activate', id: 'missing' }, check)).rejects.toThrow('no longer available');
    seed('foreign', true, { user_id: 'bob' });
    await expect(changeUserBackground(actor, { kind: 'activate', id: 'foreign' }, check)).rejects.toThrow('ownership');
    fake.rows.set(pointer, { active_background_id: 'foreign' });
    await expect(changeUserBackground(actor, { kind: 'clear' }, check)).rejects.toThrow('ownership');
    expect(fake.rows.get('user_backgrounds/foreign')?.is_active).toBe(true);
  });
  it('rejects an account change inside the transaction without writes', async () => {
    seed('old', true); let calls = 0;
    await expect(changeUserBackground(actor, { kind: 'clear' }, async () => { if (++calls === 4) throw new Error('Account changed'); })).rejects.toThrow('Account changed');
    expect(fake.rows.get('user_backgrounds/old')?.is_active).toBe(true);
    expect(fake.rows.has(pointer)).toBe(false);
  });
  it('does not delete the storage file when metadata deletion is rejected', async () => {
    seed('old', true, { storage_path: 'alice-auth/backgrounds/old.png' }); fake.rejectCommit = true;
    await expect(changeUserBackground(actor, { kind: 'delete', id: 'old' }, check)).rejects.toThrow('Write denied');
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.rows.has('user_backgrounds/old')).toBe(true);
  });
  it('clears a deleted active image atomically, then reports cleanup failure accurately', async () => {
    seed('old', true, { storage_path: 'alice-auth/backgrounds/old.png' });
    fake.remove.mockImplementation(async () => {
      expect(fake.rows.has('user_backgrounds/old')).toBe(false);
      expect(fake.rows.get(pointer)?.active_background_id).toBeNull();
      return { error: new Error('Storage unavailable') };
    });
    expect(await changeUserBackground(actor, { kind: 'delete', id: 'old' }, check)).toMatchObject({ wasActive: true, cleanupFailed: true });
  });
  it('does not remove an arbitrary legacy storage path while deleting its own metadata', async () => {
    seed('old', false, { storage_path: 'bob/backgrounds/private.png' });
    await changeUserBackground(actor, { kind: 'delete', id: 'old' }, check);
    expect(fake.remove).not.toHaveBeenCalled();
  });
  it('supports rename and inactive upload without changing the selected background', async () => {
    seed('old', true);
    await changeUserBackground(actor, { kind: 'rename', id: 'old', name: ' New name ' }, check);
    await changeUserBackground(actor, { kind: 'add', input: { imageUrl: 'gs://bucket/media/alice-auth/backgrounds/new.png', setActive: false } }, check);
    expect(fake.rows.get('user_backgrounds/old')).toMatchObject({ name: 'New name', is_active: true, user_id: actor.profileId });
    expect(fake.rows.get('user_backgrounds/new-1')?.is_active).toBe(false);
  });
});
