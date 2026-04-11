const KEY = 'vybe_frequent_emojis_v1';
const DEFAULT_EMOJIS = ['❤️', '😂', '😮', '👀', '🔥', '💀'];

interface EmojiRecord {
  emoji: string;
  count: number;
  lastUsed: number;
}

function loadStore(): EmojiRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStore(records: EmojiRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
  } catch {}
}

export function recordEmoji(emoji: string) {
  const store = loadStore();
  const existing = store.find(r => r.emoji === emoji);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = Date.now();
  } else {
    store.push({ emoji, count: 1, lastUsed: Date.now() });
  }
  // Keep max 50 entries
  store.sort((a, b) => b.count - a.count);
  saveStore(store.slice(0, 50));
}

export function getTopEmojis(count: number = 6): string[] {
  const store = loadStore();
  if (store.length === 0) return DEFAULT_EMOJIS.slice(0, count);

  // Score: count * 0.7 + recency * 0.3
  const now = Date.now();
  const scored = store.map(r => ({
    emoji: r.emoji,
    score: r.count * 0.7 + (1 - Math.min((now - r.lastUsed) / (7 * 86400000), 1)) * r.count * 0.3,
  }));
  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, count).map(s => s.emoji);

  // Fill remaining slots with defaults not already in top
  if (top.length < count) {
    for (const d of DEFAULT_EMOJIS) {
      if (!top.includes(d) && top.length < count) top.push(d);
    }
  }

  return top;
}

export { DEFAULT_EMOJIS };
