const logged = new Set<string>();

/** Log a warning at most once per session key (stops permission-error spam). */
export function warnOnce(key: string, ...args: unknown[]): void {
  if (logged.has(key)) return;
  logged.add(key);
  console.warn(...args);
}

export function isPermissionDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  const code = (error as { code?: string })?.code;
  return (
    code === 'permission-denied' ||
    /missing or insufficient permissions|permission denied|permission\.denied/i.test(message)
  );
}

/** Stop TanStack Query retries on Firestore permission errors (avoids console spam). */
export function shouldRetryQuery(failureCount: number, error: unknown, maxAttempts = 2): boolean {
  if (isPermissionDeniedError(error)) return false;
  return failureCount < maxAttempts;
}

export function isFirestoreIndexError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  return /requires an index/i.test(message);
}
