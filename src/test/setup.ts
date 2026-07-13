import { beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  get length() {
    return storage.size;
  },
  key: (index: number) => [...storage.keys()][index] ?? null,
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
});

beforeEach(() => {
  storage.clear();
});
