import { useCallback, useEffect, useState } from 'react';

const CHANGE_EVENT = 'vybe:device-preference';
const sessionFallback = new Map<string, string | null>();
const sessionOverrides = new Set<string>();

/** Device preferences still work for this session when storage is unavailable. */
export function readDevicePreference(key: string): string | null {
  if (typeof window === 'undefined') return null;
  if (sessionOverrides.has(key)) return sessionFallback.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return sessionFallback.get(key) ?? null;
  }
}

export function writeDevicePreference(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  sessionFallback.set(key, value);
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    sessionOverrides.delete(key);
  } catch {
    sessionOverrides.add(key);
    // Private browsing / full storage must not break settings or interactions.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
}

export function subscribeDevicePreference(key: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onLocalChange = (event: Event) => {
    if ((event as CustomEvent<{ key: string }>).detail.key === key) onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) {
      sessionOverrides.delete(key);
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onLocalChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocalChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useDevicePreference<T extends string>(key: string, fallback: T, values: readonly T[]) {
  const read = useCallback(() => {
    const saved = readDevicePreference(key);
    return values.includes(saved as T) ? saved as T : fallback;
  }, [key, fallback, values]);
  const [value, setValue] = useState(read);
  useEffect(() => {
    setValue(read());
    return subscribeDevicePreference(key, () => setValue(read()));
  }, [key, read]);
  const update = useCallback((next: T) => {
    if (!values.includes(next)) return;
    setValue(next);
    writeDevicePreference(key, next);
  }, [key, values]);
  return [value, update] as const;
}
