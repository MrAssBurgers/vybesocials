/**
 * Offline DM outbox.
 *
 * Queues outgoing direct messages in IndexedDB when the network is down (or a
 * send fails for a transient reason) and flushes them automatically as soon as
 * connectivity is restored. The UI shows the message immediately via the
 * existing optimistic-message system, so to the user the chat always feels
 * "sent" — it just delivers when the network is back.
 */
import { get, set } from 'idb-keyval';
import { onReconnect } from '@/lib/reconnectManager';
import {
  inferOtherParticipantId,
  repairConversationForSend,
} from '@/lib/dmMembershipRepair';
import type { ViewMode } from '@/hooks/useMessages';
import { insertDmMessage, bumpConversationUpdatedAt } from '@/lib/dmSendCore';

const KEY = 'vybe-dm-outbox-v1';

export interface OutboxItem {
  tempId: string;
  conversationId: string;
  senderId: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  viewMode: ViewMode;
  replyToId?: string;
  expiresAt: string | null;
  queuedAt: number;
}

const listeners = new Set<() => void>();
let flushing = false;
let started = false;

async function readAll(): Promise<OutboxItem[]> {
  try {
    return (await get<OutboxItem[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  try {
    await set(KEY, items);
  } catch {
    // Quota or private mode — silently skip; mutation still attempts in-memory.
  }
}

function emit() {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function onOutboxChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function enqueue(item: Omit<OutboxItem, 'queuedAt'>): Promise<void> {
  const items = await readAll();
  items.push({ ...item, queuedAt: Date.now() });
  await writeAll(items);
  emit();
}

export async function removeItem(tempId: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((i) => i.tempId !== tempId));
  emit();
}

export async function getPending(): Promise<OutboxItem[]> {
  return readAll();
}

async function sendOne(item: OutboxItem): Promise<boolean> {
  try {
    const otherProfileId =
      inferOtherParticipantId(item.conversationId, item.senderId) || null;
    await repairConversationForSend(
      item.conversationId,
      item.senderId,
      otherProfileId,
      { force: true },
    ).catch(() => {});

    const { error } = await insertDmMessage(
      {
        conversation_id: item.conversationId,
        sender_id: item.senderId,
        content: item.content,
        media_url: item.mediaUrl,
        media_type: item.mediaType,
        view_mode: item.viewMode,
        expires_at: item.expiresAt,
        reply_to_id: item.replyToId,
      },
      { otherProfileId },
    );
    if (error) {
      const msg = (error.message || '').toLowerCase();
      const transient =
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('timeout') ||
        msg.includes('fetch');
      return !transient;
    }
    void bumpConversationUpdatedAt(item.conversationId);
    return true;
  } catch {
    return false;
  }
}

export async function flush(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  flushing = true;
  try {
    const items = await readAll();
    if (!items.length) return;

    for (const item of items) {
      const ok = await sendOne(item);
      if (ok) {
        await removeItem(item.tempId);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vybe:dm-outbox-flush', { detail: { conversationId: item.conversationId } }),
          );
        }
      } else {
        // Stop on first transient failure; we'll retry on next reconnect.
        break;
      }
    }
  } finally {
    flushing = false;
  }
}

/** Wire up automatic flushing on reconnect + tab focus. Idempotent. */
export function startOutbox(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Try once on boot in case we were offline last session.
  void flush();

  onReconnect(() => {
    void flush();
  });

  window.addEventListener('online', () => {
    void flush();
  });
  window.addEventListener('vybe:online', () => {
    void flush();
  });
  window.addEventListener('focus', () => {
    void flush();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void flush();
    }
  });

  window.addEventListener('app-resumed', () => {
    void flush();
  });
}
