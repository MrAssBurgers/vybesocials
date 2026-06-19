const logged = new Set<string>();

/** Log a warning at most once per session key (stops permission-error spam). */
export function warnOnce(key: string, ...args: unknown[]): void {
  if (logged.has(key)) return;
  logged.add(key);
  console.warn(...args);
}

export function isPermissionDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error ?? '');
  return /missing or insufficient permissions|permission.denied/i.test(message);
}
