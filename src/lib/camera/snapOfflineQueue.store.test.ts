import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdbSnapQueueStore } from './snapOfflineQueue';

const state = vi.hoisted(() => ({ value: undefined as unknown, fail: false, get: vi.fn(), update: vi.fn() }));
vi.mock('idb-keyval', () => ({ get: state.get, update: state.update }));
beforeEach(() => {
  state.value = undefined; state.fail = false; state.get.mockReset(); state.update.mockReset();
  state.get.mockImplementation(async () => { if (state.fail) throw new Error('Read unavailable'); return state.value; });
  state.update.mockImplementation(async (_key: string, transform: (value: unknown) => unknown) => {
    const next = transform(state.value);
    if (state.fail) throw new Error('Commit unavailable');
    state.value = next;
  });
});

describe('IndexedDB queue adapter contract', () => {
  it('performs transforms through idb-keyval’s atomic update without a separate read', async () => {
    const store = createIdbSnapQueueStore(); await store.update(rows => rows);
    expect(state.update).toHaveBeenCalledWith('vybe-snap-outbox-v1', expect.any(Function));
    expect(state.get).not.toHaveBeenCalled(); expect(state.value).toEqual([]);
  });
  it('refuses to replace an unreadable saved value with an empty queue', async () => {
    state.value = { malformed: 'existing saved data' }; const before = state.value; const transform = vi.fn();
    const store = createIdbSnapQueueStore();
    await expect(store.read()).rejects.toThrow('has not been overwritten');
    await expect(store.update(transform)).rejects.toThrow('has not been overwritten');
    expect(transform).not.toHaveBeenCalled(); expect(state.value).toBe(before);
  });
  it('propagates failed reads and failed transaction commits', async () => {
    state.value = []; state.fail = true; const store = createIdbSnapQueueStore();
    await expect(store.read()).rejects.toThrow('Read unavailable');
    await expect(store.update(rows => rows)).rejects.toThrow('Commit unavailable');
    expect(state.value).toEqual([]);
  });
});
