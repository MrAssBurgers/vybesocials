/** Last admitted feed/list page for the current tab. A lease that has already
 * ended is not shown. Tests keep the network path deterministic. */
const enabled = import.meta.env.MODE !== 'test';
type Entry = { savedAt: number; leaseUntil: number; data: unknown };
const memory = new Map<string, Entry>();

export function readAdmittedPage<T>(key: string): { data: T; savedAt: number } | undefined {
  if (!enabled) return undefined;
  const row = memory.get(key);
  if (!row || !(row.leaseUntil > Date.now())) {
    if (row) memory.delete(key);
    return undefined;
  }
  return { data: row.data as T, savedAt: row.savedAt };
}

export function writeAdmittedPage(key: string, data: unknown, leaseUntil: number) {
  if (!enabled || !(leaseUntil > Date.now())) return;
  memory.set(key, { savedAt: Date.now(), leaseUntil, data });
}
