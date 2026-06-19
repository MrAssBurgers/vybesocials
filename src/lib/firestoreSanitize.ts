/** Strip undefined values — Firestore rejects undefined field values. */
export function sanitizeFirestoreData<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      out[key] = sanitizeFirestoreData(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}
