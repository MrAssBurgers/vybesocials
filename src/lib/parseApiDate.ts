/** Coerce Firestore Timestamp / ISO string / epoch into a Date. */
export function parseApiDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object') {
    const record = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof record.toDate === 'function') {
      const d = record.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const sec = record.seconds ?? record._seconds;
    if (typeof sec === 'number') {
      const d = new Date(sec * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function toIsoDateString(value: unknown, fallback = new Date().toISOString()): string {
  return parseApiDate(value)?.toISOString() ?? fallback;
}

export function avatarInitial(name?: string | null): string {
  const ch = (name || '?').trim()[0];
  return ch ? ch.toUpperCase() : '?';
}
