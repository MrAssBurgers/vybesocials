const KEY = 'vybe_share_recency_v1';
const MAX = 30;

interface ShareRecord {
  userId: string;
  count: number;
  lastShared: number;
}

function loadStore(): ShareRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStore(records: ShareRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {}
}

export function recordShareTo(userId: string) {
  const store = loadStore();
  const existing = store.find(r => r.userId === userId);
  if (existing) {
    existing.count += 1;
    existing.lastShared = Date.now();
  } else {
    store.push({ userId, count: 1, lastShared: Date.now() });
  }
  store.sort((a, b) => b.count - a.count);
  saveStore(store.slice(0, MAX));
}

/**
 * Returns user IDs ranked by share frequency + recency.
 * Higher score = should appear first in share sheet.
 */
export function getShareRankedUserIds(): string[] {
  const store = loadStore();
  if (store.length === 0) return [];

  const now = Date.now();
  const scored = store.map(r => ({
    userId: r.userId,
    score: r.count * 0.6 + (1 - Math.min((now - r.lastShared) / (14 * 86400000), 1)) * r.count * 0.4,
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.map(s => s.userId);
}
