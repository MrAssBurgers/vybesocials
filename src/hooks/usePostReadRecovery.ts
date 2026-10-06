import { useRef } from 'react';

/** Recover quick transport failures within the same visible read scope. */
export function usePostReadRecovery(key: string, viewGuard: (signal?: AbortSignal) => void) {
  const currentKey = useRef(key);
  currentKey.current = key;
  const started = useRef(0);
  const guard = (signal?: AbortSignal) => {
    viewGuard(signal);
    if (currentKey.current !== key) throw new DOMException('Post selection changed.', 'AbortError');
  };
  return {
    guard,
    beforeRead: (signal?: AbortSignal) => {
      guard(signal);
      if (navigator.onLine === false) throw new DOMException('Connection offline.', 'AbortError');
      started.current = Date.now();
    },
    retry: (failureCount: number, error: unknown) => {
      const elapsed = Date.now() - started.current;
      if (failureCount >= 2 || navigator.onLine === false || elapsed < 0 || elapsed >= 3000) return false;
      const rawCode = (error as { code?: unknown } | null)?.code;
      const code = typeof rawCode === 'string' ? rawCode.replace(/^(?:functions|auth)\//, '') : '';
      if (!['unavailable', 'network-request-failed'].includes(code)) return false;
      try { guard(); return true; } catch { return false; }
    },
    retryDelay: (attempt: number) => 500 * (attempt + 1),
  };
}
